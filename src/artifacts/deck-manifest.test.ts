import { randomUUID } from "node:crypto";
import { mkdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DeckManifestSchema,
  deckManifestPath,
  readDeckManifest,
  writeDeckManifest,
  type DeckManifest,
} from "./deck-manifest.js";

const scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  scratchDirs.length = 0;
});

describe("DeckManifestSchema", () => {
  it("round-trips a valid deck manifest artifact", async () => {
    const root = await scratchProject();
    const outputPath = await writeDeckManifest(root, "show", "episode", deckManifest());
    const readBack = await readDeckManifest(root, "show", "episode");

    expect(outputPath).toBe(deckManifestPath(root, "show", "episode"));
    expect(readBack).toEqual(deckManifestSchemaParsed());
  });

  it("rejects a missing slide id", () => {
    const candidate = deckManifest();
    const { id: _id, ...slide } = candidate.slides[0]!;

    expect(() => DeckManifestSchema.parse({ ...candidate, slides: [slide] })).toThrow(/id/u);
  });

  it("rejects a missing image path", () => {
    const candidate = deckManifest();

    expect(() =>
      DeckManifestSchema.parse({
        ...candidate,
        slides: [{ ...candidate.slides[0]!, image_path: "" }],
      }),
    ).toThrow(/String must contain at least 1 character/u);
  });

  it("rejects duplicate slide ids", () => {
    const candidate = deckManifest();

    expect(() =>
      DeckManifestSchema.parse({
        ...candidate,
        slides: [
          candidate.slides[0]!,
          { ...candidate.slides[1]!, id: candidate.slides[0]!.id },
        ],
      }),
    ).toThrow(/duplicate slide id/u);
  });

  it("rejects duplicate and out-of-order slide numbers", () => {
    const candidate = deckManifest();

    expect(() =>
      DeckManifestSchema.parse({
        ...candidate,
        slides: [
          candidate.slides[0]!,
          { ...candidate.slides[1]!, order: 1 },
        ],
      }),
    ).toThrow(/duplicate slide order/u);

    expect(() =>
      DeckManifestSchema.parse({
        ...candidate,
        slides: [
          { ...candidate.slides[0]!, order: 2 },
          { ...candidate.slides[1]!, order: 1 },
        ],
      }),
    ).toThrow(/original order/u);
  });

  it("preserves extraction warnings", () => {
    const parsed = DeckManifestSchema.parse(deckManifest());

    expect(parsed.extraction.warnings).toContain("slide_0002_text_ocr_fallback");
    expect(parsed.slides[1]?.warnings).toContain("ocr_fallback_used");
  });
});

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `deck-manifest-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

function deckManifestSchemaParsed(): DeckManifest {
  return DeckManifestSchema.parse(deckManifest());
}

function deckManifest(): DeckManifest {
  return {
    source: {
      kind: "pptx",
      file_type: "pptx",
      source_path: "/project/projects/show/episode/source/deck.pptx",
      sha256: "a".repeat(64),
      byte_size: 1024,
    },
    slides: [
      {
        id: "slide_0001",
        order: 1,
        image_path: "/project/projects/show/episode/slides/slide_0001.png",
        image: { width: 1280, height: 720 },
        text: "Intro",
        text_source: "native",
        speaker_notes: "Open with the customer problem.",
        notes_source: "pptx_notes",
        warnings: [],
        source: { slide_number: 1 },
      },
      {
        id: "slide_0002",
        order: 2,
        image_path: "/project/projects/show/episode/slides/slide_0002.png",
        image: { width: 1280, height: 720 },
        text: "OCR fallback text",
        text_source: "ocr",
        notes_source: "absent",
        warnings: ["ocr_fallback_used"],
        source: { slide_number: 2 },
      },
    ],
    extraction: {
      text_engine: "pptx_xml",
      notes_engine: "pptx_notes_xml",
      warnings: ["slide_0002_text_ocr_fallback"],
    },
  };
}
