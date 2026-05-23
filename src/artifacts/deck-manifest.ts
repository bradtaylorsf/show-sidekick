import path from "node:path";
import { z } from "zod";
import { atomicWrite } from "../checkpoints/io.js";
import { projectDir } from "../checkpoints/paths.js";
import { loadJson } from "../config/loader.js";

export const DeckFileTypeSchema = z.enum(["pdf", "pptx", "ppt"]);
export const DeckSourceKindSchema = z.enum(["pdf", "pptx", "ppt", "download"]);
export const SlideTextSourceSchema = z.enum(["native", "ocr", "none", "failed"]);
export const SlideNotesSourceSchema = z.enum(["pptx_notes", "operator", "absent"]);

export const DeckSlideSchema = z.object({
  id: z.string().regex(/^slide_\d{4}$/u),
  order: z.number().int().positive(),
  image_path: z.string().min(1),
  image: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  }),
  text: z.string().optional(),
  text_source: SlideTextSourceSchema,
  speaker_notes: z.string().optional(),
  notes_source: SlideNotesSourceSchema,
  warnings: z.array(z.string()).default([]),
  source: z
    .object({
      slide_number: z.number().int().positive().optional(),
      page_number: z.number().int().positive().optional(),
    })
    .default({}),
});

export const DeckManifestSchema = z
  .object({
    source: z.object({
      kind: DeckSourceKindSchema,
      file_type: DeckFileTypeSchema,
      source_path: z.string().min(1),
      original_url: z.string().url().optional(),
      sha256: z.string().regex(/^[a-f0-9]{64}$/u),
      byte_size: z.number().int().nonnegative(),
    }),
    slides: z.array(DeckSlideSchema).min(1),
    extraction: z.object({
      text_engine: z.string().min(1),
      notes_engine: z.string().min(1),
      warnings: z.array(z.string()).default([]),
    }),
  })
  .superRefine((manifest, ctx) => {
    const seenIds = new Map<string, number>();
    const seenOrders = new Map<number, number>();

    manifest.slides.forEach((slide, index) => {
      const priorIdIndex = seenIds.get(slide.id);
      if (priorIdIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", index, "id"],
          message: `duplicate slide id '${slide.id}' first used at slides[${priorIdIndex}]`,
        });
      } else {
        seenIds.set(slide.id, index);
      }

      const priorOrderIndex = seenOrders.get(slide.order);
      if (priorOrderIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", index, "order"],
          message: `duplicate slide order '${slide.order}' first used at slides[${priorOrderIndex}]`,
        });
      } else {
        seenOrders.set(slide.order, index);
      }

      const expectedOrder = index + 1;
      if (slide.order !== expectedOrder) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["slides", index, "order"],
          message: `slide order must be consecutive and in original order; expected ${expectedOrder}`,
        });
      }
    });
  });

export type DeckFileType = z.infer<typeof DeckFileTypeSchema>;
export type DeckSourceKind = z.infer<typeof DeckSourceKindSchema>;
export type DeckSlide = z.infer<typeof DeckSlideSchema>;
export type DeckManifest = z.infer<typeof DeckManifestSchema>;

export function deckManifestPath(projectRoot: string, show: string, episode: string): string {
  return path.join(projectDir(projectRoot, show, episode), "deck_manifest.json");
}

export async function writeDeckManifest(
  projectRoot: string,
  show: string,
  episode: string,
  deckManifest: DeckManifest,
): Promise<string> {
  const parsed = DeckManifestSchema.parse(deckManifest);
  const filePath = deckManifestPath(projectRoot, show, episode);

  await atomicWrite(filePath, `${JSON.stringify(parsed, null, 2)}\n`);

  return filePath;
}

export async function readDeckManifest(projectRoot: string, show: string, episode: string): Promise<DeckManifest> {
  return DeckManifestSchema.parse(await loadJson(deckManifestPath(projectRoot, show, episode), z.unknown()));
}
