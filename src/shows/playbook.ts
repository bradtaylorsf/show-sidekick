import { z } from "zod";

export const PlaybookSchema = z
  .object({
    palette: z.array(z.string()),
    transitions_allowed: z.array(z.string()),
    pacing: z.object({
      min_scene_s: z.number().nonnegative(),
      max_scene_s: z.number().positive(),
    }),
    style_cues: z.array(z.string()),
    quality_rules: z.record(z.string(), z.unknown()).optional(),
  })
  .superRefine((playbook, ctx) => {
    if (playbook.pacing.max_scene_s < playbook.pacing.min_scene_s) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pacing", "max_scene_s"],
        message: "pacing.max_scene_s must be greater than or equal to pacing.min_scene_s",
      });
    }
  });

export type Playbook = z.infer<typeof PlaybookSchema>;
