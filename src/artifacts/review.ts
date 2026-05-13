import { z } from "zod";

export const FindingSeveritySchema = z.enum(["critical", "suggestion", "nitpick", "investigation"]);

export const FindingSchema = z.object({
  severity: FindingSeveritySchema,
  title: z.string(),
  location: z.string().optional(),
  description: z.string(),
  proposed_fix: z.string().optional(),
  patch: z
    .object({
      artifact_path: z.string(),
      new_value: z.unknown(),
    })
    .optional(),
  status: z.enum(["open", "addressed", "wontfix"]).optional(),
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
    investigations: z.number().int().nonnegative().optional(),
  }),
});

export type FindingSeverity = z.infer<typeof FindingSeveritySchema>;
export type Finding = z.infer<typeof FindingSchema>;
export type Review = z.infer<typeof ReviewSchema>;
