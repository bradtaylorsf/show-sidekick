import { z } from "zod";

const ViewportSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const PageLoadStatusSchema = z.union([z.number().int().nonnegative(), z.string()]);

export const CaptureManifestSchema = z.object({
  screenshots: z.array(
    z.object({
      story_id: z.string(),
      image_path: z.string(),
      captured_at: z.string().optional(),
      viewport: z.union([z.string(), ViewportSchema]).optional(),
      quality_flags: z.array(z.string()).default([]),
      page_load_status: PageLoadStatusSchema.optional(),
      url: z.string().optional(),
      publisher: z.string().optional(),
    }),
  ),
  failures: z
    .array(
      z.object({
        story_id: z.string(),
        url: z.string().optional(),
        reason: z.string(),
        page_load_status: PageLoadStatusSchema.optional(),
      }),
    )
    .default([]),
});

export type CaptureManifest = z.infer<typeof CaptureManifestSchema>;
