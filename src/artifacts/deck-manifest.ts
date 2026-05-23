import { z } from "zod";

export const DeckFileTypeSchema = z.enum(["pdf", "ppt", "pptx"]);
export const DeckSourceKindSchema = z.enum(["pdf", "ppt", "pptx", "url"]);
export const DeckTextSourceSchema = z.enum(["native", "ocr", "absent"]);
export const DeckNotesSourceSchema = z.enum(["pptx_notes", "operator", "absent"]);

const DeckSourceSchema = z
  .object({
    kind: DeckSourceKindSchema,
    file_type: DeckFileTypeSchema,
    source_path: z.string().optional(),
    source_url: z.string().url().optional(),
    working_file_path: z.string().optional(),
    sha256: z.string(),
    byte_size: z.number().int().nonnegative(),
  })
  .superRefine((source, ctx) => {
    if (source.kind === "url" && source.source_url === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source_url"],
        message: "source_url is required when source.kind is url",
      });
    }

    if (source.kind !== "url" && source.source_path === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["source_path"],
        message: "source_path is required for local deck sources",
      });
    }
  });

const DeckImageSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
});

const DeckSlideSourceSchema = z.object({
  slide_number: z.number().int().positive(),
  source_slide_id: z.string().optional(),
});

export const DeckSlideSchema = z.object({
  id: z.string(),
  order: z.number().int().positive(),
  image_path: z.string(),
  image: DeckImageSchema,
  text: z.string().optional(),
  text_source: DeckTextSourceSchema,
  speaker_notes: z.string().optional(),
  notes_source: DeckNotesSourceSchema,
  warnings: z.array(z.string()).default([]),
  source: DeckSlideSourceSchema,
});

export const DeckManifestSchema = z
  .object({
    source: DeckSourceSchema,
    slides: z.array(DeckSlideSchema),
    extraction: z.object({
      text_engine: z.string().optional(),
      notes_engine: z.string().optional(),
      screenshot_engine: z.string().optional(),
      extracted_at: z.string().optional(),
      warnings: z.array(z.string()).default([]),
    }),
  })
  .superRefine((manifest, ctx) => {
    const slideIds = new Map<string, number>();
    const orders = new Map<number, number>();
    const sourceSlideNumbers = new Map<number, number>();

    manifest.slides.forEach((slide, index) => {
      const priorSlideIdIndex = slideIds.get(slide.id);
      if (priorSlideIdIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides"],
          message: `slide id '${slide.id}' is duplicated; first declared at slides[${priorSlideIdIndex}]`,
        });
      } else {
        slideIds.set(slide.id, index);
      }

      const priorOrderIndex = orders.get(slide.order);
      if (priorOrderIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides"],
          message: `slide order ${slide.order} is duplicated; first declared at slides[${priorOrderIndex}]`,
        });
      } else {
        orders.set(slide.order, index);
      }

      const expectedOrder = index + 1;
      if (slide.order !== expectedOrder) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides"],
          message: `slide order ${slide.order} at slides[${index}] must match its array position ${expectedOrder}`,
        });
      }

      const priorSourceSlideNumberIndex = sourceSlideNumbers.get(slide.source.slide_number);
      if (priorSourceSlideNumberIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides"],
          message: `source slide_number ${slide.source.slide_number} is duplicated; first declared at slides[${priorSourceSlideNumberIndex}]`,
        });
      } else {
        sourceSlideNumbers.set(slide.source.slide_number, index);
      }
    });
  });

export type DeckFileType = z.infer<typeof DeckFileTypeSchema>;
export type DeckSourceKind = z.infer<typeof DeckSourceKindSchema>;
export type DeckManifest = z.infer<typeof DeckManifestSchema>;
export type DeckSlide = z.infer<typeof DeckSlideSchema>;
