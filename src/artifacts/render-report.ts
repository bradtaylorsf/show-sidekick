import { z } from "zod";
import { RenderRuntimeSchema } from "./enums.js";

export const RenderReportSchema = z.object({
  output_path: z.string(),
  encoding_profile: z.string(),
  duration_s: z.number().nonnegative(),
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

export type RenderReport = z.infer<typeof RenderReportSchema>;
