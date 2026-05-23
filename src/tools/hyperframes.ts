import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
  CuesheetSchema,
  DeckManifestSchema,
  EditDecisionsSchema,
  RenderReportSchema,
  ScriptSchema,
  type RenderReport,
} from "../artifacts/index.js";
import { emitComposeBlocker } from "../compose/blocker.js";
import { assertComposeRuntime, buildPresentationDemoComposition } from "../compose/presentation-demo.js";
import { defineTool, type ToolAvailabilityContext, type ToolContext } from "../registry/index.js";

const HyperframesStepSchema = z.object({
  name: z.enum(["lint", "validate", "render"]),
  status: z.enum(["pass", "fail"]),
  stdout: z.string().default(""),
  stderr: z.string().default(""),
  exit_code: z.number().int(),
});

export const HyperframesComposeInputSchema = z.object({
  edit_decisions: EditDecisionsSchema,
  deck_manifest: DeckManifestSchema.optional(),
  cuesheet: CuesheetSchema.optional(),
  script: ScriptSchema.optional(),
  scene_plan: z.unknown().optional(),
  composition_spec_path: z.string().optional(),
  output_path: z.string().optional(),
});

export type HyperframesComposeInput = z.infer<typeof HyperframesComposeInputSchema>;
export type HyperframesStep = z.infer<typeof HyperframesStepSchema>;
export type CommandResult = {
  stdout: string;
  stderr: string;
  exit_code: number;
};

type HyperframesContext = ToolContext & {
  runCommand?: (binary: string, args: string[], options: { cwd: string }) => Promise<CommandResult>;
};

const STEPS = ["lint", "validate", "render"] as const;

export default defineTool({
  name: "hyperframes",
  capability: "video_compose",
  provider: "hyperframes",
  status: "production",
  integration: {
    kind: "cli",
    binary: "npx",
    auth: { mode: "none" },
    install: "npm install --save-dev hyperframes",
  },
  best_for: "HyperFrames composition specs with mandatory lint and validate gates before render",
  supports: ["hyperframes", "lint", "validate", "render", "playbook-css-variables"],
  input: HyperframesComposeInputSchema,
  output: RenderReportSchema,
  isAvailable: async (ctx) => hyperframesAvailable(ctx),

  async execute(params, ctx) {
    const parsed = HyperframesComposeInputSchema.parse(params);
    assertComposeRuntime(parsed.edit_decisions, "hyperframes");
    const hyperCtx = ctx as HyperframesContext;
    const tempDir = parsed.composition_spec_path ? undefined : await mkdtemp(join(tmpdir(), "show-sidekick-hyperframes-"));
    const specPath = parsed.composition_spec_path ?? join(tempDir as string, "composition.hyperframes.json");

    try {
      if (!parsed.composition_spec_path) {
        await writeFile(specPath, JSON.stringify(buildHyperframesCompositionSpec(parsed), null, 2));
      }

      const validationSteps: RenderReport["validation_steps"] = [];

      for (const step of STEPS) {
        const result = await runHyperframesStep(step, specPath, hyperCtx);
        validationSteps.push({
          name: step,
          status: result.status === "pass" ? "pass" : "fail",
          notes: result.status === "pass" ? undefined : excerpt(result.stderr || result.stdout),
        });

        if (result.status === "fail" && step !== "render") {
          const report = reportFor(parsed, validationSteps);
          emitComposeBlocker(
            {
              type: "hyperframes_validation_failed",
              attempted: "hyperframes",
              failed: `hyperframes ${step} failed: ${excerpt(result.stderr || result.stdout)}`,
              options: ["hyperframes"],
              recommendation: "Fix the HyperFrames composition spec so lint and validate pass before invoking render.",
            },
            { render_report: report },
          );
        }
      }

      return reportFor(parsed, validationSteps);
    } finally {
      if (tempDir) {
        await rm(tempDir, { force: true, recursive: true });
      }
    }
  },
});

export async function runHyperframesStep(
  step: (typeof STEPS)[number],
  specPath: string,
  ctx: HyperframesContext,
): Promise<HyperframesStep> {
  const runCommand = ctx.runCommand ?? runExecFile;
  const result = await runCommand("npx", ["hyperframes", step, specPath], { cwd: ctx.projectRoot });

  return HyperframesStepSchema.parse({
    name: step,
    status: result.exit_code === 0 ? "pass" : "fail",
    stdout: result.stdout,
    stderr: result.stderr,
    exit_code: result.exit_code,
  });
}

function runExecFile(binary: string, args: string[], options: { cwd: string }): Promise<CommandResult> {
  return new Promise((resolve) => {
    execFile(binary, args, { cwd: options.cwd, maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      resolve({
        stdout,
        stderr,
        exit_code: error && typeof error.code === "number" ? error.code : error ? 1 : 0,
      });
    });
  });
}

function hyperframesAvailable(
  ctx?: ToolAvailabilityContext,
): Promise<{ available: true } | { available: false; reason: string; fix: "install" }> {
  return new Promise((resolve) => {
    execFile(
      "npx",
      ["--no-install", "hyperframes", "--version"],
      { cwd: ctx?.projectRoot, timeout: 2_500 },
      (error, _stdout, stderr) => {
        if (error) {
          const reason = stderr.trim() || (error instanceof Error ? error.message : String(error));
          resolve({ available: false, reason: `hyperframes not available via npx --no-install: ${reason}`, fix: "install" });
          return;
        }

        resolve({ available: true });
      },
    );
  });
}

export function buildHyperframesCompositionSpec(params: HyperframesComposeInput): Record<string, unknown> {
  const presentation =
    params.deck_manifest === undefined
      ? undefined
      : buildPresentationDemoComposition({
          deck_manifest: params.deck_manifest,
          edit_decisions: params.edit_decisions,
          scene_plan: params.scene_plan,
          script: params.script,
          cuesheet: params.cuesheet,
          output_path: params.output_path,
          runtime: "hyperframes",
        });

  return {
    runtime: "hyperframes",
    output_path: params.output_path,
    cuts: params.edit_decisions.cuts,
    overlays: params.edit_decisions.overlays,
    renderer_family: params.edit_decisions.renderer_family,
    deck_manifest: params.deck_manifest,
    presentation,
    captions: presentation?.captions,
    audio: presentation?.audio ?? (params.cuesheet ? { path: params.cuesheet.audio.path, duration_s: params.cuesheet.audio.duration_s } : undefined),
  };
}

function reportFor(params: HyperframesComposeInput, validationSteps: RenderReport["validation_steps"]): RenderReport {
  const presentation =
    params.deck_manifest === undefined
      ? undefined
      : buildPresentationDemoComposition({
          deck_manifest: params.deck_manifest,
          edit_decisions: params.edit_decisions,
          scene_plan: params.scene_plan,
          script: params.script,
          cuesheet: params.cuesheet,
          output_path: params.output_path,
          runtime: "hyperframes",
        });
  const duration = presentation?.duration_s ?? params.edit_decisions.cuts.reduce((max, cut) => Math.max(max, cut.end_s), 0);
  const expectedDuration = presentation?.expected_duration_s ?? params.cuesheet?.audio.duration_s ?? duration;
  const fps = 30;

  return RenderReportSchema.parse({
    output_path: params.output_path ?? "renders/hyperframes.mp4",
    encoding_profile: "hyperframes/default",
    duration_s: duration,
    expected_duration_s: expectedDuration,
    drift_s: driftSeconds(duration, expectedDuration),
    drift_frames: driftFrames(duration, expectedDuration, fps),
    drift_tolerance_s: 1 / fps,
    within_tolerance: driftFrames(duration, expectedDuration, fps) <= 1,
    resolution: { width: 1920, height: 1080 },
    framerate: fps,
    runtime_used: "hyperframes",
    asset_count: presentation?.scenes.length ?? params.edit_decisions.cuts.length,
    warnings: [],
    validation_steps: [
      ...validationSteps,
      ...(presentation === undefined
        ? []
        : [
            {
              name: "presentation_demo_composition",
              status: "pass" as const,
              notes: presentation.validation_notes.join(" "),
            },
          ]),
    ],
  });
}

function excerpt(text: string, limit = 600): string {
  const normalized = text.trim().replace(/\s+/g, " ");
  return normalized.length > limit ? `${normalized.slice(0, limit)}...` : normalized;
}

function driftSeconds(actual: number, expected: number): number {
  return Number(Math.abs(actual - expected).toFixed(3));
}

function driftFrames(actual: number, expected: number, fps: number): number {
  return Number((driftSeconds(actual, expected) * fps).toFixed(3));
}
