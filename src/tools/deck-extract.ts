import { inflateRawSync } from "node:zlib";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { CaptureManifestSchema } from "../artifacts/capture-manifest.js";
import { DeckManifestSchema, type DeckManifest, type DeckSlide } from "../artifacts/deck-manifest.js";
import { atomicWrite } from "../checkpoints/io.js";
import { encodeRgbaPng } from "../media/png.js";
import { defineTool } from "../registry/index.js";
import { resolveProjectReadPath, resolveProjectWritePath } from "../tool-support/paths.js";
import { countPdfPages, DeckIngestOutputSchema, type DeckFileType } from "./deck-ingest.js";

const SLIDE_WIDTH = 1280;
const SLIDE_HEIGHT = 720;

export const DeckExtractInputSchema = z.object({
  ingest_output: DeckIngestOutputSchema,
  output_dir: z.string().min(1),
  operator_notes: z.string().optional(),
  ocr: z.boolean().default(true),
  write_capture_manifest: z.boolean().default(true),
});

export const DeckExtractOutputSchema = z.object({
  deck_manifest_path: z.string().min(1),
  capture_manifest_path: z.string().min(1).optional(),
  slide_count: z.number().int().positive(),
  warnings: z.array(z.string()),
});

export type DeckExtractInput = z.infer<typeof DeckExtractInputSchema>;
export type DeckExtractOutput = z.infer<typeof DeckExtractOutputSchema>;

export type ExtractedSlide = {
  slideNumber: number;
  text?: string;
  speakerNotes?: string;
  textSource: "native" | "ocr" | "none" | "failed";
  notesSource: "pptx_notes" | "operator" | "absent";
  warnings: string[];
};

type ZipEntry = {
  name: string;
  method: number;
  compressedSize: number;
  uncompressedSize: number;
  localOffset: number;
};

export default defineTool({
  name: "deck_extract",
  capability: "deck_extract",
  provider: "local",
  status: "production",
  integration: {
    kind: "library",
    package: "node:zlib",
    install: "No install required for fixture-safe extraction. Install LibreOffice later for high-fidelity deck rasterization.",
  },
  best_for:
    "Extracting slide identity, screenshot image files, text, speaker notes, provenance, and capture compatibility from an ingested deck",
  supports: ["deck-manifest", "capture-manifest", "pptx-notes", "pdf-text", "presentation-demo"],
  cost: { unit: "call", usd: 0 },
  input: DeckExtractInputSchema,
  output: DeckExtractOutputSchema,

  async execute(params, ctx): Promise<DeckExtractOutput> {
    const input = DeckExtractInputSchema.parse(params);
    const outputDir = resolveProjectWritePath(input.output_dir, ctx.projectRoot);
    const slidesDir = path.join(outputDir, "slides");
    const sourcePath = resolveProjectReadPath(input.ingest_output.source_path, ctx.projectRoot);

    await mkdir(slidesDir, { recursive: true });

    const sourceBuffer = await readFile(sourcePath);
    const extracted = extractSlides({
      fileType: input.ingest_output.file_type,
      buffer: sourceBuffer,
      fallbackCount: input.ingest_output.slide_count ?? input.ingest_output.page_count,
      operatorNotes: input.operator_notes,
      ocr: input.ocr,
    });
    const extractionWarnings = new Set<string>();
    const slides: DeckSlide[] = [];

    for (const extractedSlide of extracted) {
      const id = slideId(extractedSlide.slideNumber);
      const imagePath = path.join(slidesDir, `${id}.png`);
      await writeFile(imagePath, placeholderSlidePng(extractedSlide.slideNumber));

      const warnings = [...extractedSlide.warnings, "slide_image_render_fallback"];
      warnings.forEach((warning) => extractionWarnings.add(`${id}_${warning}`));
      slides.push({
        id,
        order: extractedSlide.slideNumber,
        image_path: imagePath,
        image: { width: SLIDE_WIDTH, height: SLIDE_HEIGHT },
        text: extractedSlide.text,
        text_source: extractedSlide.textSource,
        speaker_notes: extractedSlide.speakerNotes,
        notes_source: extractedSlide.notesSource,
        warnings,
        source:
          input.ingest_output.file_type === "pdf"
            ? { page_number: extractedSlide.slideNumber }
            : { slide_number: extractedSlide.slideNumber },
      });
    }

    const deckManifest = DeckManifestSchema.parse({
      source: {
        kind: input.ingest_output.source_kind,
        file_type: input.ingest_output.file_type,
        source_path: input.ingest_output.source_path,
        original_url: input.ingest_output.original_url,
        sha256: input.ingest_output.sha256,
        byte_size: input.ingest_output.byte_size,
      },
      slides,
      extraction: {
        text_engine: textEngine(input.ingest_output.file_type, input.ocr),
        notes_engine: notesEngine(input.ingest_output.file_type),
        warnings: [...extractionWarnings],
      },
    } satisfies DeckManifest);
    const deckManifestPath = path.join(outputDir, "deck_manifest.json");
    await atomicWrite(deckManifestPath, `${JSON.stringify(deckManifest, null, 2)}\n`);

    let captureManifestPath: string | undefined;
    if (input.write_capture_manifest) {
      const captureManifest = CaptureManifestSchema.parse({
        screenshots: deckManifest.slides.map((slide) => ({
          story_id: slide.id,
          image_path: slide.image_path,
          viewport: slide.image,
          quality_flags: slide.warnings,
        })),
        failures: [],
      });
      captureManifestPath = path.join(outputDir, "capture_manifest.json");
      await atomicWrite(captureManifestPath, `${JSON.stringify(captureManifest, null, 2)}\n`);
    }

    return DeckExtractOutputSchema.parse({
      deck_manifest_path: deckManifestPath,
      capture_manifest_path: captureManifestPath,
      slide_count: deckManifest.slides.length,
      warnings: deckManifest.extraction.warnings,
    });
  },
});

export function extractSlides(input: {
  fileType: DeckFileType;
  buffer: Buffer;
  fallbackCount?: number;
  operatorNotes?: string;
  ocr: boolean;
}): ExtractedSlide[] {
  if (input.fileType === "pptx") {
    return extractPptxSlides(input.buffer, input.operatorNotes);
  }
  if (input.fileType === "pdf") {
    return extractPdfSlides(input.buffer, input.fallbackCount, input.operatorNotes, input.ocr);
  }

  return Array.from({ length: input.fallbackCount ?? 1 }, (_, index) => ({
    slideNumber: index + 1,
    speakerNotes: input.operatorNotes,
    textSource: "none",
    notesSource: input.operatorNotes === undefined ? "absent" : "operator",
    warnings: ["binary_ppt_extraction_requires_conversion", "text_extraction_unavailable"],
  }));
}

export function extractPptxSlides(buffer: Buffer, operatorNotes: string | undefined): ExtractedSlide[] {
  const files = zipTextFiles(buffer);
  const slideNumbers = [...files.keys()]
    .flatMap((name) => {
      const match = /^ppt\/slides\/slide(\d+)\.xml$/u.exec(name);
      return match?.[1] === undefined ? [] : [Number.parseInt(match[1], 10)];
    })
    .sort((left, right) => left - right);

  return slideNumbers.map((number) => {
    const id = `ppt/slides/slide${number}.xml`;
    const notesId = `ppt/notesSlides/notesSlide${number}.xml`;
    const text = extractXmlText(files.get(id) ?? "");
    const notes = extractXmlText(files.get(notesId) ?? "");
    const speakerNotes = notes || operatorNotes;
    const warnings: string[] = [];

    if (!text) {
      warnings.push("text_extraction_empty");
    }
    if (!notes && operatorNotes !== undefined) {
      warnings.push("operator_notes_fallback");
    }

    return {
      slideNumber: number,
      text: text || undefined,
      speakerNotes: speakerNotes || undefined,
      textSource: text ? "native" : "none",
      notesSource: notes ? "pptx_notes" : operatorNotes === undefined ? "absent" : "operator",
      warnings,
    };
  });
}

export function extractPdfSlides(
  buffer: Buffer,
  fallbackCount: number | undefined,
  operatorNotes: string | undefined,
  ocr: boolean,
): ExtractedSlide[] {
  const pageCount = fallbackCount ?? countPdfPages(buffer) ?? 1;
  const textRuns = extractPdfTextRuns(buffer);
  return Array.from({ length: pageCount }, (_, index) => ({
    slideNumber: index + 1,
    text: (textRuns[index] ?? textRuns.join(" ")).trim() || undefined,
    speakerNotes: operatorNotes,
    textSource: (textRuns[index] ?? textRuns.join(" ")).trim() ? "native" : ocr ? "none" : "none",
    notesSource: operatorNotes === undefined ? "absent" : "operator",
    warnings: (textRuns[index] ?? textRuns.join(" ")).trim() ? [] : [ocr ? "ocr_unavailable" : "text_extraction_empty"],
  }));
}

export function zipTextFiles(buffer: Buffer): Map<string, string> {
  const entries = zipEntries(buffer);
  const files = new Map<string, string>();

  for (const entry of entries) {
    const localHeader = entry.localOffset;
    if (buffer.readUInt32LE(localHeader) !== 0x04034b50) {
      continue;
    }

    const nameLength = buffer.readUInt16LE(localHeader + 26);
    const extraLength = buffer.readUInt16LE(localHeader + 28);
    const dataStart = localHeader + 30 + nameLength + extraLength;
    const dataEnd = dataStart + entry.compressedSize;
    if (dataEnd > buffer.length) {
      continue;
    }

    const compressed = buffer.subarray(dataStart, dataEnd);
    let data: Buffer;
    if (entry.method === 0) {
      data = compressed;
    } else if (entry.method === 8) {
      data = inflateRawSync(compressed);
    } else {
      continue;
    }

    if (entry.uncompressedSize > 0 && data.length !== entry.uncompressedSize) {
      continue;
    }

    files.set(entry.name, data.toString("utf8"));
  }

  return files;
}

function zipEntries(buffer: Buffer): ZipEntry[] {
  const entries: ZipEntry[] = [];

  for (let offset = 0; offset <= buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      continue;
    }

    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const uncompressedSize = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;

    if (nameEnd > buffer.length) {
      break;
    }

    entries.push({
      name: buffer.subarray(nameStart, nameEnd).toString("utf8"),
      method,
      compressedSize,
      uncompressedSize,
      localOffset,
    });
    offset = nameEnd + extraLength + commentLength - 1;
  }

  return entries;
}

function extractXmlText(xml: string): string {
  const textRuns = [...xml.matchAll(/<(?:[a-z]+:)?t\b[^>]*>([\s\S]*?)<\/(?:[a-z]+:)?t>/giu)].map((match) =>
    decodeXml(match[1] ?? ""),
  );
  return textRuns.join(" ").replace(/\s+/gu, " ").trim();
}

function extractPdfTextRuns(buffer: Buffer): string[] {
  const text = buffer.toString("latin1");
  return [...text.matchAll(/\(([^()]*)\)\s*Tj/gu)].map((match) => decodePdfString(match[1] ?? ""));
}

function decodeXml(value: string): string {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'");
}

function decodePdfString(value: string): string {
  return value.replace(/\\([()\\])/gu, "$1");
}

function placeholderSlidePng(slideNumber: number): Buffer {
  const data = new Uint8Array(SLIDE_WIDTH * SLIDE_HEIGHT * 4);
  const tint = 245 - (slideNumber % 5) * 8;

  for (let index = 0; index < data.length; index += 4) {
    data[index] = tint;
    data[index + 1] = 248;
    data[index + 2] = 250;
    data[index + 3] = 255;
  }

  return encodeRgbaPng({ width: SLIDE_WIDTH, height: SLIDE_HEIGHT, data });
}

function slideId(slideNumber: number): string {
  return `slide_${String(slideNumber).padStart(4, "0")}`;
}

function textEngine(fileType: DeckFileType, ocr: boolean): string {
  if (fileType === "pptx") {
    return "pptx_xml";
  }
  if (fileType === "pdf") {
    return ocr ? "pdf_native_text_with_ocr_unavailable" : "pdf_native_text";
  }
  return "binary_ppt_unavailable";
}

function notesEngine(fileType: DeckFileType): string {
  if (fileType === "pptx") {
    return "pptx_notes_xml";
  }
  if (fileType === "pdf") {
    return "operator_notes";
  }
  return "operator_notes";
}
