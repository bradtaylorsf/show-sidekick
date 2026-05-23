import { z } from "zod";

export const DeckSourceSchema = z.object({
  kind: z.enum(["pdf", "ppt", "pptx", "url", "unknown"]),
  path: z.string().optional(),
  url: z.string().optional(),
  title: z.string().optional(),
  sha256: z.string().optional(),
});

export const DeckSlideSchema = z.object({
  id: z.string(),
  index: z.number().int().nonnegative(),
  screenshot_path: z.string(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  title: z.string().optional(),
  text: z.string().optional(),
  speaker_notes: z.string().optional(),
  provenance: z
    .object({
      source_page: z.number().int().positive().optional(),
      extraction: z.string().optional(),
    })
    .optional(),
});

export const DeckManifestSchema = z
  .object({
    source: DeckSourceSchema,
    slide_count: z.number().int().nonnegative(),
    slides: z.array(DeckSlideSchema),
    generated_at: z.string().optional(),
    notes: z.array(z.string()).default([]),
  })
  .refine((manifest) => manifest.slide_count === manifest.slides.length, {
    message: "slide_count must match slides.length",
    path: ["slide_count"],
  });

export type DeckSource = z.infer<typeof DeckSourceSchema>;
export type DeckSlide = z.infer<typeof DeckSlideSchema>;
export type DeckManifest = z.infer<typeof DeckManifestSchema>;
