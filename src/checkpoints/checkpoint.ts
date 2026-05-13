import { z } from "zod";

export const CHECKPOINT_STATUS = ["in_progress", "completed", "awaiting_human", "failed"] as const;
export const CheckpointStatusSchema = z.enum(CHECKPOINT_STATUS);

export const CheckpointSchema = z.object({
  stage: z.string(),
  status: CheckpointStatusSchema,
  timestamp: z.string(),
  artifact: z.unknown(),
  review_summary: z
    .object({
      decision: z.string().optional(),
      rounds: z.number().int().nonnegative(),
      critical: z.number().int().nonnegative(),
      suggestions: z.number().int().nonnegative(),
      nitpicks: z.number().int().nonnegative(),
      findings: z.array(z.unknown()).default([]),
    })
    .optional(),
  cost_snapshot: z
    .object({
      stage_cost_usd: z.number().nonnegative(),
      total_so_far_usd: z.number().nonnegative(),
      budget_remaining_usd: z.number(),
    })
    .optional(),
  tool_invocations: z
    .array(
      z.object({
        tool: z.string(),
        provider: z.string().optional(),
        model: z.string().optional(),
        seed: z.number().int().optional(),
        units: z.number().optional(),
        usd: z.number().optional(),
      }),
    )
    .default([]),
  style_playbook: z.unknown().optional(),
  skills_read: z.array(z.string()).optional(),
});

export type CheckpointStatus = z.infer<typeof CheckpointStatusSchema>;
export type Checkpoint = z.infer<typeof CheckpointSchema>;
