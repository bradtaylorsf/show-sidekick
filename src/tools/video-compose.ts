import { z } from "zod";
import {
  AssetManifestSchema,
  DecisionLogSchema,
  EditDecisionsSchema,
  ProposalPacketSchema,
  RenderReportSchema,
  RenderRuntimeSchema,
  type RenderReport,
  type RenderRuntime,
} from "../artifacts/index.js";
import { ComposeBlockerError, emitComposeBlocker } from "../compose/blocker.js";
import { hasRuntimeSupersession, validatePreCompose } from "../compose/pre-compose-validation.js";
import { defineTool, Registry, type Availability, type Tool, type ToolContext } from "../registry/index.js";

export const VideoComposeInputSchema = z.object({
  edit_decisions: EditDecisionsSchema,
  runtime_override: RenderRuntimeSchema.optional(),
  proposal_packet: ProposalPacketSchema.optional(),
  asset_manifest: AssetManifestSchema.optional(),
  decision_log: DecisionLogSchema.optional(),
  output_path: z.string().optional(),
  planned_duration_s: z.number().positive().optional(),
  drift_tolerance_frames: z.number().positive().optional(),
});

export type VideoComposeInput = z.infer<typeof VideoComposeInputSchema>;

type RuntimeTool = Tool<unknown, unknown>;

type RuntimeRegistry = {
  refreshAvailability(options?: { concurrency?: number; timeoutMs?: number; context?: Pick<ToolContext, "projectRoot"> }): Promise<void>;
  get(name: string): RuntimeTool | undefined;
  getAvailability(name: string): Availability | undefined;
};

type VideoComposeContext = ToolContext & {
  registry?: RuntimeRegistry;
  getRuntimeTool?: (runtime: RenderRuntime) => RuntimeTool | undefined | Promise<RuntimeTool | undefined>;
  bypassPreComposeValidation?: boolean;
};

const RUNTIME_NAMES = ["ffmpeg", "remotion", "hyperframes"] as const;

export default defineTool({
  name: "video_compose",
  capability: "video_compose",
  provider: "show-sidekick",
  status: "production",
  integration: {
    kind: "library",
    package: "show-sidekick",
    install: "bundled",
  },
  best_for: "runtime routing for FFmpeg, Remotion, and HyperFrames with pre-compose validation",
  supports: ["ffmpeg", "remotion", "hyperframes", "pre-compose-validation"],
  input: VideoComposeInputSchema,
  output: RenderReportSchema,

  async execute(params, ctx) {
    const composeCtx = ctx as VideoComposeContext;
    const runtime = params.runtime_override ?? params.edit_decisions.render_runtime;

    if (
      runtime !== params.edit_decisions.render_runtime &&
      !hasRuntimeSupersession(params.decision_log, params.edit_decisions.render_runtime, runtime)
    ) {
      emitComposeBlocker({
        type: "runtime_swap_unlogged",
        attempted: runtime,
        failed: `runtime_override ${runtime} does not match edit_decisions.render_runtime ${params.edit_decisions.render_runtime}; no supersession was logged.`,
        options: RUNTIME_NAMES.map((name) => name),
        recommendation: "Record an approved render_runtime_selection supersession before composing with a different runtime.",
      });
    }

    const { runtimeTool, availability, options } = await resolveRuntimeTool(runtime, composeCtx);

    if (!runtimeTool || availability?.available !== true) {
      emitComposeBlocker({
        type: "runtime_unavailable",
        attempted: runtime,
        failed: availability?.available === false ? availability.reason : `runtime tool not registered: ${runtime}`,
        options,
        recommendation: "Install or enable the approved runtime, or record an approved render_runtime_selection supersession before choosing another runtime.",
      });
    }

    const validation = validatePreCompose({
      edit_decisions: params.edit_decisions,
      proposal_packet: params.proposal_packet,
      asset_manifest: params.asset_manifest,
      decision_log: params.decision_log,
      projectRoot: ctx.projectRoot,
      planned_duration_s: params.planned_duration_s,
    });

    const validationStatus = validation.status === "passed" ? "passed" : "failed";

    if (validation.status === "failed" && composeCtx.bypassPreComposeValidation !== true) {
      emitComposeBlocker({
        type: "pre_compose_failed",
        attempted: runtime,
        failed: "Pre-compose validation failed.",
        options,
        recommendation: "Fix the failed validation findings before invoking the encoder, or explicitly bypass for diagnostics.",
        findings: validation.findings.filter((finding) => finding.status === "fail"),
      });
    }

    const report = RenderReportSchema.parse(
      await runtimeTool.execute(buildRuntimeParams(runtime, params), ctx),
    );

    return withPreComposeWarning(
      report,
      validation.status === "failed" && composeCtx.bypassPreComposeValidation === true ? "bypassed" : validationStatus,
      {
        expectedDurationS:
          params.planned_duration_s ?? params.edit_decisions.cuts.reduce((sum, cut) => sum + (cut.end_s - cut.start_s), 0),
        toleranceFrames: params.drift_tolerance_frames ?? 1,
      },
    );
  },
});

async function resolveRuntimeTool(
  runtime: RenderRuntime,
  ctx: VideoComposeContext,
): Promise<{ runtimeTool: RuntimeTool | undefined; availability: Availability | undefined; options: string[] }> {
  if (ctx.getRuntimeTool) {
    const runtimeTool = await ctx.getRuntimeTool(runtime);
    const availability = runtimeTool ? await runtimeTool.isAvailable(ctx) : undefined;
    const options = availability?.available === true ? [runtime] : [];
    return { runtimeTool, availability, options };
  }

  const registry = ctx.registry ?? (await defaultRegistry());
  await registry.refreshAvailability({ context: ctx });

  const runtimeTool = registry.get(runtime);
  const availability = registry.getAvailability(runtime);
  const options = RUNTIME_NAMES.filter((name) => registry.getAvailability(name)?.available === true);

  return { runtimeTool, availability, options };
}

function buildRuntimeParams(runtime: RenderRuntime, params: VideoComposeInput): unknown {
  if (runtime === "ffmpeg") {
    return {
      operation: "compose",
      edit_decisions: params.edit_decisions,
      asset_manifest: params.asset_manifest,
      output_path: params.output_path,
      planned_duration_s: params.planned_duration_s,
      drift_tolerance_frames: params.drift_tolerance_frames,
    };
  }

  return {
    edit_decisions: params.edit_decisions,
    runtime_override: runtime,
    proposal_packet: params.proposal_packet,
    asset_manifest: params.asset_manifest,
    decision_log: params.decision_log,
    output_path: params.output_path,
    planned_duration_s: params.planned_duration_s,
    drift_tolerance_frames: params.drift_tolerance_frames,
  };
}

async function defaultRegistry(): Promise<Registry> {
  const registry = new Registry();
  await registry.discover();
  return registry;
}

function withPreComposeWarning(
  report: RenderReport,
  status: "passed" | "bypassed" | "failed",
  drift: { expectedDurationS: number; toleranceFrames: number },
): RenderReport {
  const framerate = report.framerate;
  const driftS = report.drift_s ?? roundSeconds(Math.abs(report.duration_s - drift.expectedDurationS));
  const driftFrames = report.drift_frames ?? roundFrames(driftS * framerate);
  const driftToleranceS = report.drift_tolerance_s ?? drift.toleranceFrames / framerate;
  const withinTolerance = report.within_tolerance ?? driftFrames <= drift.toleranceFrames + 1e-6;
  const hasRenderDriftStep = report.validation_steps.some((step) => step.name === "render_drift");

  return RenderReportSchema.parse({
    ...report,
    expected_duration_s: report.expected_duration_s ?? drift.expectedDurationS,
    drift_s: driftS,
    drift_frames: driftFrames,
    drift_tolerance_s: driftToleranceS,
    within_tolerance: withinTolerance,
    warnings: [...report.warnings, `pre_compose_validation: ${status}`],
    validation_steps: [
      ...report.validation_steps,
      ...(hasRenderDriftStep
        ? []
        : [
            {
              name: "render_drift",
              status: driftValidationStatus(driftFrames, drift.toleranceFrames),
              notes: `expected=${drift.expectedDurationS.toFixed(3)}s actual=${report.duration_s.toFixed(3)}s drift=${driftFrames.toFixed(2)} frames tolerance=${drift.toleranceFrames.toFixed(2)} frames`,
            } as const,
          ]),
    ],
  });
}

function driftValidationStatus(driftFrames: number, toleranceFrames: number): "pass" | "warn" | "fail" {
  if (driftFrames > toleranceFrames + 1e-6) {
    return "fail";
  }

  return toleranceFrames > 1 && driftFrames > 1 ? "warn" : "pass";
}

function roundSeconds(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundFrames(value: number): number {
  return Math.round(value * 1000) / 1000;
}

export { ComposeBlockerError };
