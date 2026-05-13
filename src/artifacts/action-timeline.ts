import { z } from "zod";

export const ActionTimelineEntrySchema = z.object({
  time_s: z.number().nonnegative(),
  pose: z.string(),
  transition_frames: z.number().int().nonnegative(),
  ease: z.string(),
});

export const ActionTimelineSchema = z.record(z.string(), z.array(ActionTimelineEntrySchema));

export type ActionTimelineEntry = z.infer<typeof ActionTimelineEntrySchema>;
export type ActionTimeline = z.infer<typeof ActionTimelineSchema>;
