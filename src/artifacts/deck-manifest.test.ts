import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { ArtifactJsonSchemas } from "./json-schema.js";
import { CaptureManifestSchema } from "./capture-manifest.js";
import { DeckManifestSchema, type DeckManifest } from "./deck-manifest.js";

const fixtureDir = fileURLToPath(new URL("../../bundled/fixtures/schemas/", import.meta.url));

describe("DeckManifestSchema", () => {
  it("parses the canonical bundled fixture", async () => {
    const fixture = await readFixture("deck_manifest.json");

    expect(() => DeckManifestSchema.parse(fixture)).not.toThrow();
  });

  it("parses a multi-slide PPTX fixture with speaker notes", async () => {
    const fixture = await readDeckFixture("deck_manifest.pptx-with-notes.json");

    expect(fixture.slides).toHaveLength(3);
    expect(fixture.slides.every((slide) => slide.notes_source === "pptx_notes")).toBe(true);
    expect(fixture.slides.map((slide) => slide.speaker_notes)).toEqual([
      "Open by naming the pain: teams already have strong deck material but need a video draft.",
      "Explain that Show Sidekick extracts slide evidence and drafts a voiceover for review.",
      "Close with the handoff promise: animated rough cut plus edit package for a human editor.",
    ]);
  });

  it("parses a PDF fixture without notes using OCR text warnings", async () => {
    const fixture = await readDeckFixture("deck_manifest.pdf-no-notes.json");

    expect(fixture.source.file_type).toBe("pdf");
    expect(fixture.slides).toHaveLength(3);
    expect(fixture.slides.every((slide) => slide.notes_source === "absent")).toBe(true);
    expect(fixture.slides.every((slide) => slide.text_source === "ocr")).toBe(true);
    expect(fixture.extraction.warnings).toContain("PDF source did not include speaker notes; operator notes were absent.");
  });

  it("rejects duplicate slide IDs", async () => {
    const fixture = await readDeckFixture("deck_manifest.pptx-with-notes.json");
    fixture.slides[1]!.id = fixture.slides[0]!.id;

    const result = DeckManifestSchema.safeParse(fixture);

    expect(result.success).toBe(false);
    expect(messagesFor(result)).toContain("slide id 'slide-001' is duplicated");
  });

  it("rejects duplicate and out-of-order slide orders", async () => {
    const duplicateOrder = await readDeckFixture("deck_manifest.pptx-with-notes.json");
    duplicateOrder.slides[1]!.order = duplicateOrder.slides[0]!.order;

    const outOfOrder = await readDeckFixture("deck_manifest.pptx-with-notes.json");
    outOfOrder.slides[0]!.order = 2;
    outOfOrder.slides[1]!.order = 1;

    expect(messagesFor(DeckManifestSchema.safeParse(duplicateOrder))).toContain("slide order 1 is duplicated");
    expect(messagesFor(DeckManifestSchema.safeParse(outOfOrder))).toContain(
      "slide order 2 at slides[0] must match its array position 1",
    );
  });

  it("rejects duplicate source slide numbers", async () => {
    const fixture = await readDeckFixture("deck_manifest.pptx-with-notes.json");
    fixture.slides[1]!.source.slide_number = fixture.slides[0]!.source.slide_number;

    const result = DeckManifestSchema.safeParse(fixture);

    expect(result.success).toBe(false);
    expect(messagesFor(result)).toContain("source slide_number 1 is duplicated");
  });

  it("rejects a slide missing its image path", async () => {
    const fixture = (await readDeckFixture("deck_manifest.pptx-with-notes.json")) as unknown as {
      slides: Array<Record<string, unknown>>;
    };
    delete fixture.slides[0]!.image_path;

    const result = DeckManifestSchema.safeParse(fixture);

    expect(result.success).toBe(false);
    expect(messagesFor(result)).toContain("Required");
  });

  it("preserves extraction warnings through serialization", async () => {
    const fixture = await readDeckFixture("deck_manifest.pdf-no-notes.json");
    fixture.slides[1]!.warnings.push("OCR confidence below operator review threshold.");

    const parsed = DeckManifestSchema.parse(fixture);
    const reparsed = DeckManifestSchema.parse(JSON.parse(JSON.stringify(parsed)));

    expect(reparsed.extraction.warnings).toEqual(parsed.extraction.warnings);
    expect(reparsed.slides[1]!.warnings).toEqual(parsed.slides[1]!.warnings);
  });

  it("keeps deck_manifest and capture_manifest schemas registered independently", () => {
    expect(ArtifactJsonSchemas.deck_manifest).toBeDefined();
    expect(ArtifactJsonSchemas.capture_manifest).toBeDefined();
    expect(() =>
      CaptureManifestSchema.parse({
        screenshots: [{ story_id: "slide-001", image_path: "captures/slides/slide-001.png" }],
      }),
    ).not.toThrow();
  });
});

async function readFixture(fileName: string): Promise<unknown> {
  return JSON.parse(await readFile(path.join(fixtureDir, fileName), "utf8")) as unknown;
}

async function readDeckFixture(fileName: string): Promise<DeckManifest> {
  return DeckManifestSchema.parse(await readFixture(fileName));
}

function messagesFor(result: ReturnType<typeof DeckManifestSchema.safeParse>): string {
  return result.success ? "" : result.error.issues.map((issue) => issue.message).join("\n");
}
