import { createRequire } from "node:module";
import { z } from "zod";
import {
  CuesheetSchema,
  EditDecisionsSchema,
  PlaybookSchema,
  RenderReportSchema,
  type RenderReport,
} from "../artifacts/index.js";
import { playbookToCssVariables } from "../compose/hyperframes-style-bridge.js";
import { cuesheetToWords, validateCaptionFrameSync } from "../remotion/index.js";
import { defineTool } from "../registry/index.js";

const require = createRequire(import.meta.url);

export const RemotionComposeInputSchema = z.object({
  edit_decisions: EditDecisionsSchema,
  output_path: z.string().optional(),
  cuesheet: CuesheetSchema.optional(),
  playbook: PlaybookSchema.optional(),
  fps: z.number().positive().default(30),
});

export type RemotionComposeInput = z.infer<typeof RemotionComposeInputSchema>;

export default defineTool({
  name: "remotion",
  capability: "video_compose",
  provider: "remotion",
  status: "beta",
  integration: {
    kind: "library",
    package: "remotion",
    install: "pnpm add remotion react react-dom @remotion/renderer",
  },
  best_for: "typed Remotion-compatible scene catalog validation with word-level caption checks; renderer invocation lands with the compose runner",
  supports: ["scene-catalog", "caption-burn", "playbook-css-variables"],
  input: RemotionComposeInputSchema,
  output: RenderReportSchema,
  isAvailable: async () => remotionAvailable(),

  async execute(params) {
    const parsed = RemotionComposeInputSchema.parse(params);
    const validationSteps: RenderReport["validation_steps"] = [];

    if (parsed.cuesheet) {
      const words = cuesheetToWords(parsed.cuesheet);
      const sync = validateCaptionFrameSync(words, parsed.fps);
      validationSteps.push({
        name: "caption_sync",
        status: sync.status,
        notes: `${sync.checked_words} words checked; max drift ${sync.max_drift_s}s at ${parsed.fps}fps.`,
      });
    }

    if (parsed.playbook) {
      playbookToCssVariables(parsed.playbook);
      validationSteps.push({
        name: "style_bridge",
        status: "pass",
        notes: "Playbook palette, typography, motion, and caption style resolved through the shared CSS bridge.",
      });
    }

    const duration = parsed.edit_decisions.cuts.reduce((max, cut) => Math.max(max, cut.end_s), 0);

    return RenderReportSchema.parse({
      output_path: parsed.output_path ?? "renders/remotion.mp4",
      encoding_profile: "remotion/default",
      duration_s: duration,
      resolution: { width: 1920, height: 1080 },
      framerate: parsed.fps,
      runtime_used: "remotion",
      asset_count: parsed.edit_decisions.cuts.length,
      warnings: [],
      validation_steps: validationSteps,
    });
  },
});

function remotionAvailable(): { available: true } | { available: false; reason: string; fix: "install" } {
  try {
    require.resolve("remotion");
    return { available: true };
  } catch {
    return { available: false, reason: "package not installed: remotion", fix: "install" };
  }
}
