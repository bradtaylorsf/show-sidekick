import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CaptureManifestSchema } from "../artifacts/capture-manifest.js";
import { DeckManifestSchema } from "../artifacts/deck-manifest.js";
import type { ToolContext } from "../registry/index.js";
import deckExtract, { extractPptxSlides, zipTextFiles } from "./deck-extract.js";
import deckIngest from "./deck-ingest.js";

const scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  scratchDirs.length = 0;
});

describe("deck_extract", () => {
  it("extracts PPTX slide text and speaker notes into deck_manifest", async () => {
    const projectRoot = await scratchProject();
    const sourceRoot = await scratchDir("deck-extract-source-");
    const source = path.join(sourceRoot, "notes.pptx");
    await writeFile(
      source,
      pptxFixture({
        "ppt/slides/slide1.xml": textXml("Intro slide"),
        "ppt/slides/slide2.xml": textXml("Demo steps"),
        "ppt/notesSlides/notesSlide1.xml": textXml("Prefer this note for the opening VO."),
        "ppt/notesSlides/notesSlide2.xml": textXml("Explain the three demo steps."),
      }),
    );

    const ingest = await deckIngest.execute({ source, output_dir: "work/source" }, context(projectRoot));
    const output = await deckExtract.execute({ ingest_output: ingest, output_dir: "work/extracted" }, context(projectRoot));
    const manifest = DeckManifestSchema.parse(JSON.parse(await readFile(output.deck_manifest_path, "utf8")));

    expect(output.slide_count).toBe(2);
    expect(manifest.slides.map((slide) => slide.id)).toEqual(["slide_0001", "slide_0002"]);
    expect(manifest.slides[0]).toMatchObject({
      text: "Intro slide",
      text_source: "native",
      speaker_notes: "Prefer this note for the opening VO.",
      notes_source: "pptx_notes",
    });
    expect(manifest.slides[1]).toMatchObject({
      text: "Demo steps",
      speaker_notes: "Explain the three demo steps.",
    });
    expect(manifest.slides[0]?.warnings).toContain("slide_image_render_fallback");
  });

  it("extracts PDF text and records absent notes", async () => {
    const projectRoot = await scratchProject();
    const sourceRoot = await scratchDir("deck-extract-source-");
    const source = path.join(sourceRoot, "slides.pdf");
    await writeFile(source, pdfFixture(2, "Native PDF text"));

    const ingest = await deckIngest.execute({ source, output_dir: "work/source" }, context(projectRoot));
    const output = await deckExtract.execute({ ingest_output: ingest, output_dir: "work/extracted" }, context(projectRoot));
    const manifest = DeckManifestSchema.parse(JSON.parse(await readFile(output.deck_manifest_path, "utf8")));

    expect(manifest.slides).toHaveLength(2);
    expect(manifest.slides[0]).toMatchObject({
      id: "slide_0001",
      text: "Native PDF text",
      text_source: "native",
      notes_source: "absent",
      source: { page_number: 1 },
    });
    expect(manifest.extraction.text_engine).toBe("pdf_native_text_with_ocr_unavailable");
  });

  it("writes capture_manifest compatibility with slide ids as story ids", async () => {
    const projectRoot = await scratchProject();
    const source = path.join(projectRoot, "source.pdf");
    await writeFile(source, pdfFixture(1, "Compatibility"));
    const ingest = await deckIngest.execute({ source, output_dir: "work/source" }, context(projectRoot));
    const output = await deckExtract.execute({ ingest_output: ingest, output_dir: "work/extracted" }, context(projectRoot));

    expect(output.capture_manifest_path).toBe(path.join(projectRoot, "work/extracted/capture_manifest.json"));
    const captureManifest = CaptureManifestSchema.parse(
      JSON.parse(await readFile(output.capture_manifest_path!, "utf8")),
    );

    expect(captureManifest.screenshots).toHaveLength(1);
    expect(captureManifest.screenshots[0]?.story_id).toBe("slide_0001");
    expect(captureManifest.screenshots[0]?.image_path).toMatch(/slide_0001\.png$/u);
  });

  it("records extraction warnings when native text is unavailable", async () => {
    const projectRoot = await scratchProject();
    const source = path.join(projectRoot, "blank.pdf");
    await writeFile(source, pdfFixture(1, ""));
    const ingest = await deckIngest.execute({ source, output_dir: "work/source" }, context(projectRoot));
    const output = await deckExtract.execute({ ingest_output: ingest, output_dir: "work/extracted" }, context(projectRoot));
    const manifest = DeckManifestSchema.parse(JSON.parse(await readFile(output.deck_manifest_path, "utf8")));

    expect(manifest.slides[0]?.text_source).toBe("none");
    expect(manifest.slides[0]?.warnings).toContain("ocr_unavailable");
    expect(output.warnings).toContain("slide_0001_ocr_unavailable");
  });
});

describe("deck extraction helpers", () => {
  it("reads stored PPTX XML entries", () => {
    const pptx = pptxFixture({
      "ppt/slides/slide1.xml": textXml("One"),
      "ppt/notesSlides/notesSlide1.xml": textXml("Note one"),
    });

    expect(zipTextFiles(pptx).get("ppt/slides/slide1.xml")).toContain("One");
    expect(extractPptxSlides(pptx, undefined)[0]).toMatchObject({
      text: "One",
      speakerNotes: "Note one",
      notesSource: "pptx_notes",
    });
  });
});

async function scratchProject(): Promise<string> {
  const root = await scratchDir("deck-extract-project-");
  await mkdir(root, { recursive: true });
  return root;
}

async function scratchDir(prefix: string): Promise<string> {
  const dir = path.join(tmpdir(), `${prefix}${randomUUID()}`);
  scratchDirs.push(dir);
  await mkdir(dir, { recursive: true });
  return dir;
}

function context(projectRoot: string): ToolContext {
  return {
    projectRoot,
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
      event: vi.fn(),
    },
  };
}

function textXml(text: string): string {
  return `<p:txBody><a:p><a:r><a:t>${text}</a:t></a:r></a:p></p:txBody>`;
}

function pdfFixture(pageCount: number, text: string): Buffer {
  const pages = Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 obj << /Type /Page /Parent 2 0 R >> stream BT (${text}) Tj ET endstream endobj`);
  return Buffer.from(
    [
      "%PDF-1.4",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      `2 0 obj << /Type /Pages /Count ${pageCount} /Kids [] >> endobj`,
      ...pages,
      "%%EOF",
    ].join("\n"),
  );
}

function pptxFixture(entries: Record<string, string>): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const [name, xml] of Object.entries(entries)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(xml);
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBuffer.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26);
    nameBuffer.copy(local, 30);
    data.copy(local, 30 + nameBuffer.length);
    localParts.push(local);

    const central = Buffer.alloc(46 + nameBuffer.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuffer.copy(central, 46);
    centralParts.push(central);
    offset += local.length;
  }

  return Buffer.concat([...localParts, ...centralParts]);
}

function crc32(buffer: Buffer): number {
  return createHash("sha1").update(buffer).digest().readUInt32LE(0);
}
