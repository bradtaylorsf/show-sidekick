import { z } from "zod";

export const BriefSchema = z.object({
  title: z.string(),
  audience: z.string(),
  platform: z.string(),
  tone: z.string(),
  duration_s: z.number().positive(),
  hook: z.string(),
  key_points: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

export type Brief = z.infer<typeof BriefSchema>;
