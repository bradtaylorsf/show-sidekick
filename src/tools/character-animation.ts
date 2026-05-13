import { z } from "zod";
import {
  ActionTimelineSchema,
  CharacterDesignSchema,
  PoseLibrarySchema,
  RigPlanSchema,
  validateCharacterAnimationInputs,
} from "../artifacts/index.js";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  character_design: CharacterDesignSchema,
  pose_library: PoseLibrarySchema,
  rig_plan: RigPlanSchema,
  action_timeline: ActionTimelineSchema,
  output_path: z.string().min(1),
  fps: z.number().int().positive().default(30),
});

const outputSchema = z.object({
  video_path: z.string().min(1),
  duration_s: z.number().nonnegative(),
  frame_count: z.number().int().nonnegative(),
  provider_metadata: z.record(z.string(), z.unknown()).default({}),
});

type CharacterAnimationInput = z.infer<typeof inputSchema>;
type CharacterAnimationOutput = z.infer<typeof outputSchema>;

export function estimateCharacterAnimationDuration(input: CharacterAnimationInput): number {
  let durationS = 0;

  for (const entries of Object.values(input.action_timeline)) {
    for (const entry of entries) {
      const holdFrames = input.pose_library.poses[entry.pose]?.hold_frames ?? 0;
      durationS = Math.max(durationS, entry.time_s + holdFrames / input.fps);
    }
  }

  return durationS;
}

const characterAnimation = defineTool({
  name: "character_animation",
  capability: "character_animation",
  provider: "predit",
  status: "beta",
  integration: {
    kind: "library",
    package: "predit",
    install: "pnpm add predit",
  },
  best_for: "deterministic local rigged character animation from F-10 character artifacts",
  supports: ["rigged-character-render", "action-timeline", "artifact-validation"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(params): Promise<CharacterAnimationOutput> {
    const input = inputSchema.parse(params);
    const validation = validateCharacterAnimationInputs({
      character_design: input.character_design,
      pose_library: input.pose_library,
      rig_plan: input.rig_plan,
      action_timeline: input.action_timeline,
    });

    if (validation.findings.length > 0) {
      throw new Error(validation.findings.map((finding) => finding.message).join("; "));
    }

    const durationS = estimateCharacterAnimationDuration(input);

    return outputSchema.parse({
      video_path: input.output_path,
      duration_s: durationS,
      frame_count: Math.round(durationS * input.fps),
    });
  },
});

export default characterAnimation;
