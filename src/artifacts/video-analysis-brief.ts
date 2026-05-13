import { z } from "zod";

export const MotionTypeSchema = z.enum(["motion_clip", "animated_still", "static_image"]);

const AttributeListSchema = z.array(z.string());

export const VideoAnalysisBriefSchema = z.object({
  pacing_style: z.string().min(1).optional(),
  promise_elements: z.array(z.string()).default([]),
  approved_budget_usd: z.number().nonnegative().optional(),
  scenes: z.array(
    z.object({
      scene_ref: z.string().optional(),
      subject: AttributeListSchema,
      subject_motion: AttributeListSchema,
      scene: AttributeListSchema,
      spatial_framing: AttributeListSchema,
      camera: AttributeListSchema,
      motion_type: MotionTypeSchema,
      flow_variance: z.number(),
    }),
  ),
});

export type MotionType = z.infer<typeof MotionTypeSchema>;
export type VideoAnalysisBrief = z.infer<typeof VideoAnalysisBriefSchema>;
