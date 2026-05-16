import { z } from "zod";
import { RenderRuntimeSchema } from "./enums.js";

export const ClipTrimReportSchema = z.object({
  asset_id: z.string(),
  requested_duration_s: z.number().positive(),
  actual_duration_s: z.number().nonnegative(),
  drift_s: z.number().nonnegative(),
  drift_frames: z.number().nonnegative(),
  within_tolerance: z.boolean(),
});

export const RenderReportSchema = z.object({
  output_path: z.string(),
  encoding_profile: z.string(),
  duration_s: z.number().nonnegative(),
  expected_duration_s: z.number().nonnegative().optional(),
  drift_s: z.number().nonnegative().optional(),
  drift_frames: z.number().nonnegative().optional(),
  drift_tolerance_s: z.number().positive().optional(),
  within_tolerance: z.boolean().optional(),
  clip_trims: z.array(ClipTrimReportSchema).optional(),
  resolution: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  framerate: z.number().positive(),
  runtime_used: RenderRuntimeSchema,
  asset_count: z.number().int().nonnegative(),
  warnings: z.array(z.string()).default([]),
  validation_steps: z
    .array(
      z.object({
        name: z.string(),
        status: z.enum(["pass", "warn", "fail"]),
        notes: z.string().optional(),
      }),
    )
    .default([]),
});

export type ClipTrimReport = z.infer<typeof ClipTrimReportSchema>;
export type RenderReport = z.infer<typeof RenderReportSchema>;
