import { z } from "zod";

export const CharacterDesignSchema = z.object({
  slug: z.string(),
  required_actions: z.array(z.string()).default([]),
  required_emotions: z.array(z.string()).default([]),
  visual_description: z.string(),
  references: z
    .array(
      z.object({
        path: z.string(),
        role: z.string().optional(),
      }),
    )
    .default([]),
});

export type CharacterDesign = z.infer<typeof CharacterDesignSchema>;
