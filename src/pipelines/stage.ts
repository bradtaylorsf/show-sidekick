import { z } from "zod";

export const HumanApprovalSchema = z.enum(["required", "optional", "never"]);
export const AudioSyncSchema = z.enum(["build", "required", "none"]);

const EstimatedCostSchema = z.object({
  usd: z.number().nonnegative(),
  comment: z.string().optional(),
});

export const StageSchema = z.object({
  slug: z.string(),
  description: z.string().optional(),
  skill: z.string(),
  produces: z.string(),
  tools_available: z.array(z.string()).default([]),
  review_focus: z.array(z.string()).default([]),
  success_criteria: z.array(z.unknown()).default([]),
  human_approval: HumanApprovalSchema.default("optional"),
  audio_sync: AudioSyncSchema.optional(),
  sample_mode_supported: z.boolean().optional(),
  estimated_cost: z
    .object({
      sample: EstimatedCostSchema,
      full: EstimatedCostSchema,
    })
    .optional(),
  requires_runtime: z.string().optional(),
});

export type HumanApproval = z.infer<typeof HumanApprovalSchema>;
export type AudioSync = z.infer<typeof AudioSyncSchema>;
export type Stage = z.infer<typeof StageSchema>;
