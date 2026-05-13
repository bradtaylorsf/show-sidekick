import { z } from "zod";

export const EndTagPlanSchema = z.object({
  mode: z.enum(["overlay", "concat"]),
  text: z.string(),
  placement_seconds_from_end: z.number().nonnegative(),
  style_ref: z.string().optional(),
});

export type EndTagPlan = z.infer<typeof EndTagPlanSchema>;
