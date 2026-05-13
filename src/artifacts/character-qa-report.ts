import { z } from "zod";

export const CharacterQaFindingSchema = z.object({
  character: z.string(),
  aspect: z.enum(["consistency", "anatomy", "expression", "costume", "other"]),
  severity: z.enum(["critical", "suggestion", "nitpick"]),
  description: z.string(),
  evidence: z.string().optional(),
});

export const CharacterQaReportSchema = z.object({
  findings: z.array(CharacterQaFindingSchema).default([]),
  summary: z.object({
    characters_reviewed: z.number().int().nonnegative(),
    critical: z.number().int().nonnegative(),
    suggestions: z.number().int().nonnegative(),
  }),
});

export type CharacterQaFinding = z.infer<typeof CharacterQaFindingSchema>;
export type CharacterQaReport = z.infer<typeof CharacterQaReportSchema>;
