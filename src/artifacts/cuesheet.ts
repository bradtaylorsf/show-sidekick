import { z } from "zod";

export const CuesheetWordSchema = z
  .object({
    text: z.string(),
    start_s: z.number().nonnegative(),
    end_s: z.number().nonnegative(),
    confidence: z.number().min(0).max(1).optional(),
  })
  .refine((word) => word.end_s >= word.start_s, {
    message: "word end_s must be greater than or equal to start_s",
    path: ["end_s"],
  });

export const CuesheetSegmentSchema = z
  .object({
    start_s: z.number().nonnegative(),
    end_s: z.number().nonnegative(),
    text: z.string().optional(),
    words: z.array(CuesheetWordSchema).default([]),
  })
  .refine((segment) => segment.end_s >= segment.start_s, {
    message: "segment end_s must be greater than or equal to start_s",
    path: ["end_s"],
  });

export const CuesheetSchema = z
  .object({
    audio: z.unknown().optional(),
    master_clock: z.enum(["audio", "voiceover"]).optional(),
    words: z.array(CuesheetWordSchema).optional(),
    segments: z.array(CuesheetSegmentSchema).default([]),
  })
  .passthrough();

export type CuesheetWord = z.infer<typeof CuesheetWordSchema>;
export type CuesheetSegment = z.infer<typeof CuesheetSegmentSchema>;
export type Cuesheet = z.infer<typeof CuesheetSchema>;
