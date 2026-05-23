import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import deckIngest, {
  DeckIngestError,
  countPdfPages,
  countPptxSlides,
  detectDeckFileType,
  zipEntryNames,
} from "./deck-ingest.js";
import type { ToolContext } from "../registry/index.js";

const scratchDirs: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(scratchDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  scratchDirs.length = 0;
});

describe("deck_ingest", () => {
  it("registers the local deck ingestion capability", () => {
    expect(deckIngest.name).toBe("deck_ingest");
    expect(deckIngest.capability).toBe("deck_ingest");
    expect(deckIngest.integration).toMatchObject({ kind: "library", package: "node:fs" });
  });

  it("normalizes a local PDF and reports page count", async () => {
    const projectRoot = await scratchProject();
    const sourceRoot = await scratchDir("deck-source-");
    const source = path.join(sourceRoot, "pitch.pdf");
    await writeFile(source, pdfFixture(2));

    const output = await deckIngest.execute({ source, output_dir: "work/deck" }, context(projectRoot));
    const provenance = JSON.parse(await readFile(output.provenance_path, "utf8")) as Record<string, unknown>;

    expect(output).toMatchObject({
      source_kind: "pdf",
      file_type: "pdf",
      page_count: 2,
      byte_size: Buffer.byteLength(pdfFixture(2)),
      warnings: [],
    });
    expect(output.source_path).toBe(path.join(projectRoot, "work/deck/pitch.pdf"));
    expect(provenance.original_source).toBe(source);
    expect(provenance.sha256).toBe(output.sha256);
  });

  it("normalizes a local PPTX and reports slide count", async () => {
    const projectRoot = await scratchProject();
    const sourceRoot = await scratchDir("deck-source-");
    const source = path.join(sourceRoot, "slides.pptx");
    const pptx = pptxFixture(["ppt/slides/slide1.xml", "ppt/slides/slide2.xml", "ppt/notesSlides/notesSlide1.xml"]);
    await writeFile(source, pptx);

    const output = await deckIngest.execute({ source, output_dir: "work/deck" }, context(projectRoot));

    expect(output).toMatchObject({
      source_kind: "pptx",
      file_type: "pptx",
      slide_count: 2,
      warnings: [],
    });
    expect(countPptxSlides(pptx)).toBe(2);
    expect(zipEntryNames(pptx)).toContain("ppt/slides/slide1.xml");
  });

  it("accepts a local legacy PPT with metadata warning", async () => {
    const projectRoot = await scratchProject();
    const sourceRoot = await scratchDir("deck-source-");
    const source = path.join(sourceRoot, "legacy.ppt");
    await writeFile(source, Buffer.concat([oleHeader(), Buffer.from("legacy ppt")]));

    const output = await deckIngest.execute({ source, output_dir: "work/deck" }, context(projectRoot));

    expect(output).toMatchObject({
      source_kind: "ppt",
      file_type: "ppt",
      warnings: ["binary_ppt_unsupported_metadata"],
    });
    expect(output.slide_count).toBeUndefined();
  });

  it("downloads a direct deck URL into the project root with URL provenance", async () => {
    const projectRoot = await scratchProject();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(pdfFixture(1), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-disposition": 'attachment; filename="remote.pdf"',
        },
      })),
    );

    const output = await deckIngest.execute(
      { source: "https://example.com/download?id=123", output_dir: "downloads/deck" },
      context(projectRoot),
    );
    const provenance = JSON.parse(await readFile(output.provenance_path, "utf8")) as Record<string, unknown>;

    expect(output).toMatchObject({
      source_kind: "download",
      file_type: "pdf",
      original_url: "https://example.com/download?id=123",
      page_count: 1,
    });
    expect(output.source_path).toBe(path.join(projectRoot, "downloads/deck/remote.pdf"));
    expect(provenance.original_url).toBe("https://example.com/download?id=123");
  });

  it("rejects unsupported local extensions before any downstream provider call", async () => {
    const projectRoot = await scratchProject();
    const sourceRoot = await scratchDir("deck-source-");
    const source = path.join(sourceRoot, "keynote.key");
    await writeFile(source, "not a supported deck");

    await expect(deckIngest.execute({ source, output_dir: "work/deck" }, context(projectRoot))).rejects.toMatchObject({
      code: "UNSUPPORTED_DECK_EXTENSION",
    });
  });

  it("rejects authenticated or login-redirect URLs with a stable code", async () => {
    const projectRoot = await scratchProject();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(null, {
        status: 302,
        headers: { location: "https://accounts.google.com/signin/v2/challenge" },
      })),
    );

    await expect(
      deckIngest.execute({ source: "https://docs.google.com/presentation/d/abc/edit", output_dir: "work/deck" }, context(projectRoot)),
    ).rejects.toMatchObject({ code: "AUTHENTICATED_URL_UNSUPPORTED" });
  });

  it("rejects oversized downloads before writing files", async () => {
    const projectRoot = await scratchProject();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(pdfFixture(1), {
        status: 200,
        headers: {
          "content-type": "application/pdf",
          "content-length": String(2 * 1024 * 1024),
        },
      })),
    );

    await expect(
      deckIngest.execute(
        { source: "https://example.com/too-large.pdf", output_dir: "work/deck", max_download_mb: 1 },
        context(projectRoot),
      ),
    ).rejects.toMatchObject({ code: "DOWNLOAD_TOO_LARGE" });
  });

  it("allows absolute read paths while rejecting output path traversal", async () => {
    const projectRoot = await scratchProject();
    const sourceRoot = await scratchDir("deck-source-");
    const source = path.join(sourceRoot, "absolute.pdf");
    await writeFile(source, pdfFixture(1));

    await expect(deckIngest.execute({ source, output_dir: "../../escape" }, context(projectRoot))).rejects.toThrow(
      /inside project root/u,
    );
  });
});

describe("deck ingestion helpers", () => {
  it("detects deck type from content type and magic bytes", () => {
    expect(detectDeckFileType({ buffer: pdfFixture(1), contentType: "application/pdf" }).fileType).toBe("pdf");
    expect(detectDeckFileType({ buffer: pptxFixture(["ppt/slides/slide1.xml"]) }).fileType).toBe("pptx");
    expect(detectDeckFileType({ buffer: oleHeader() }).fileType).toBe("ppt");
  });

  it("counts only PDF page objects, not the pages tree", () => {
    expect(countPdfPages(pdfFixture(3))).toBe(3);
  });

  it("throws a typed error for unknown downloaded bytes", () => {
    expect(() => detectDeckFileType({ buffer: Buffer.from("not a deck") })).toThrow(DeckIngestError);
  });
});

async function scratchProject(): Promise<string> {
  const root = await scratchDir("deck-ingest-project-");
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

function pdfFixture(pageCount: number): Buffer {
  const pages = Array.from({ length: pageCount }, (_, index) => `${index + 3} 0 obj << /Type /Page /Parent 2 0 R >> endobj`);
  return Buffer.from(
    [
      "%PDF-1.4",
      "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
      "2 0 obj << /Type /Pages /Count 2 /Kids [3 0 R 4 0 R] >> endobj",
      ...pages,
      "%%EOF",
    ].join("\n"),
  );
}

function oleHeader(): Buffer {
  return Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
}

function pptxFixture(names: string[]): Buffer {
  const localParts: Buffer[] = [];
  const centralParts: Buffer[] = [];
  let offset = 0;

  for (const name of names) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.from(`<xml>${name}</xml>`);
    const local = Buffer.alloc(30 + nameBuffer.length + data.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 8);
    local.writeUInt32LE(0, 14);
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
    central.writeUInt32LE(0, 16);
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
