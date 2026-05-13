import { z } from "zod";

export const PoseSchema = z.object({
  description: z.string(),
  // Integer frames, not seconds; convert with hold_frames / fps only at render time.
  hold_frames: z.number().int().min(0),
  transition_to: z
    .record(
      z.string(),
      z.object({
        transition_frames: z.number().int().min(0),
        ease: z.string(),
      }),
    )
    .default({}),
});

export const ExpressionSchema = z.object({
  description: z.string(),
  joints: z.record(z.string(), z.unknown()).default({}),
});

export const PoseLibrarySchema = z.object({
  poses: z.record(z.string(), PoseSchema),
  expressions: z.record(z.string(), ExpressionSchema),
});

export type Pose = z.infer<typeof PoseSchema>;
export type Expression = z.infer<typeof ExpressionSchema>;
export type PoseLibrary = z.infer<typeof PoseLibrarySchema>;
