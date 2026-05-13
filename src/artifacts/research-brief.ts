import { z } from "zod";

export const ResearchBriefSchema = z.object({
  topic_exploration: z.string(),
  sources: z.array(
    z.object({
      url: z.string(),
      title: z.string().optional(),
      accessed_at: z.string().optional(),
      summary: z.string().optional(),
    }),
  ),
  findings: z.array(
    z.object({
      claim: z.string(),
      evidence: z.string().optional(),
      source_refs: z.array(z.string()).optional(),
    }),
  ),
});

export type ResearchBrief = z.infer<typeof ResearchBriefSchema>;
