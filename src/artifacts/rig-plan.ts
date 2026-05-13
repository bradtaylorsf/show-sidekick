import { z } from "zod";

const PointSchema = z.object({
  x: z.number(),
  y: z.number(),
});

export const RigJointSchema = z.object({
  id: z.string(),
  parent: z.string().nullable(),
  pivot: PointSchema,
  default_rotation_deg: z.number(),
  range_deg: z
    .object({
      min: z.number(),
      max: z.number(),
    })
    .optional(),
});

export const RigPlanSchema = z.object({
  character: z.string(),
  joints: z.array(RigJointSchema).min(1),
  attachment_points: z
    .array(
      z.object({
        id: z.string(),
        joint: z.string(),
        offset: PointSchema,
      }),
    )
    .default([]),
});

export type RigJoint = z.infer<typeof RigJointSchema>;
export type RigPlan = z.infer<typeof RigPlanSchema>;
