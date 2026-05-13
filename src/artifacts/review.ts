import { z } from "zod";

export const FindingSeveritySchema = z.enum(["critical", "suggestion", "nitpick", "investigation"]);
export const FindingStatusSchema = z.enum(["pending", "fixed", "accepted", "deferred"]);

export const FindingPatchSchema = z.object({
  artifact_path: z.string(),
  new_value: z.unknown(),
});

export const FindingSchema = z.object({
  severity: FindingSeveritySchema,
  title: z.string(),
  location: z.string().min(1),
  description: z.string(),
  proposed_fix: z.string().optional(),
  proposed_change: z.string().optional(),
  patch: FindingPatchSchema.optional(),
  status: FindingStatusSchema.default("pending"),
});

export const ReviewSchema = z.object({
  stage: z.string(),
  round: z.number().int().nonnegative(),
  decision: z.enum(["pass", "revise", "pass_with_warnings"]),
  findings: z.array(FindingSchema).default([]),
  summary: z.object({
    critical: z.number().int().nonnegative(),
    suggestions: z.number().int().nonnegative(),
    nitpicks: z.number().int().nonnegative(),
    investigations: z.number().int().nonnegative(),
    success_criteria_met: z.number().int().nonnegative(),
    success_criteria_total: z.number().int().nonnegative(),
  }),
});

export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;
export type FindingStatus = z.infer<typeof FindingStatusSchema>;
export type FindingPatch = z.infer<typeof FindingPatchSchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Review = z.infer<typeof ReviewSchema>;
