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
});

export type VideoComposeInput = z.infer<typeof VideoComposeInputSchema>;

type RuntimeTool = Tool<unknown, unknown>;

type RuntimeRegistry = {
  refreshAvailability(options?: { concurrency?: number; timeoutMs?: number }): Promise<void>;
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
  provider: "predit",
  status: "production",
  integration: {
    kind: "library",
    package: "predit",
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
      await runtimeTool.execute(
        {
          edit_decisions: params.edit_decisions,
          runtime_override: runtime,
          proposal_packet: params.proposal_packet,
          asset_manifest: params.asset_manifest,
          decision_log: params.decision_log,
        },
        ctx,
      ),
    );

    return withPreComposeWarning(
      report,
      validation.status === "failed" && composeCtx.bypassPreComposeValidation === true ? "bypassed" : validationStatus,
    );
  },
});

async function resolveRuntimeTool(
  runtime: RenderRuntime,
  ctx: VideoComposeContext,
): Promise<{ runtimeTool: RuntimeTool | undefined; availability: Availability | undefined; options: string[] }> {
  if (ctx.getRuntimeTool) {
    const runtimeTool = await ctx.getRuntimeTool(runtime);
    const availability = runtimeTool ? await runtimeTool.isAvailable() : undefined;
    const options = availability?.available === true ? [runtime] : [];
    return { runtimeTool, availability, options };
  }

  const registry = ctx.registry ?? (await defaultRegistry());
  await registry.refreshAvailability();

  const runtimeTool = registry.get(runtime);
  const availability = registry.getAvailability(runtime);
  const options = RUNTIME_NAMES.filter((name) => registry.getAvailability(name)?.available === true);

  return { runtimeTool, availability, options };
}

async function defaultRegistry(): Promise<Registry> {
  const registry = new Registry();
  await registry.discover();
  return registry;
}

function withPreComposeWarning(report: RenderReport, status: "passed" | "bypassed" | "failed"): RenderReport {
  return RenderReportSchema.parse({
    ...report,
    warnings: [...report.warnings, `pre_compose_validation: ${status}`],
  });
}

export { ComposeBlockerError };
