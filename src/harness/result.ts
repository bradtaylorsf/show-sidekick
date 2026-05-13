import { z } from "zod";
import { DecisionEntrySchema } from "../artifacts/decision-log.js";

export const StageCostUsedSchema = z.object({
  stage_cost_usd: z.number().nonnegative(),
  total_so_far_usd: z.number().nonnegative(),
  budget_remaining_usd: z.number(),
});

export const StageReviewSummarySchema = z.object({
  decision: z.string().optional(),
  rounds: z.number().int().nonnegative(),
  critical: z.number().int().nonnegative(),
  suggestions: z.number().int().nonnegative(),
  nitpicks: z.number().int().nonnegative(),
  findings: z.array(z.unknown()).default([]),
});

export const StageResultSchema = z.object({
  artifact: z.unknown(),
  cost_used: StageCostUsedSchema,
  decisions: z.array(DecisionEntrySchema),
  review_summary: StageReviewSummarySchema.optional(),
});

export type StageCostUsed = z.infer<typeof StageCostUsedSchema>;
export type StageReviewSummary = z.infer<typeof StageReviewSummarySchema>;
export type StageResult = z.infer<typeof StageResultSchema>;
