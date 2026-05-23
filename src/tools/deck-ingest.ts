import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/index.js";
import { resolveProjectReadPath, resolveProjectWritePath } from "../tool-support/paths.js";

const inputSchema = z.object({
  source: z.string().min(1),
  output_dir: z.string().min(1),
  expected_type: z.enum(["pdf", "ppt", "pptx", "auto"]).default("auto"),
});

const deckFileTypeSchema = z.enum(["pdf", "ppt", "pptx"]);

const outputSchema = z.object({
  file_path: z.string().min(1),
  file_type: deckFileTypeSchema,
  source: z.object({
    kind: z.enum(["local", "url"]),
    source_path: z.string().optional(),
    source_url: z.string().url().optional(),
  }),
  sha256: z.string().min(1),
  byte_size: z.number().int().nonnegative(),
  page_or_slide_count: z.number().int().positive().optional(),
  warnings: z.array(z.string()),
});

export type DeckIngestInput = z.infer<typeof inputSchema>;
export type DeckFileType = z.infer<typeof deckFileTypeSchema>;
export type DeckIngestOutput = z.infer<typeof outputSchema>;

export type DeckIngestFailureReason =
  | "unsupported_extension"
  | "authenticated_url_unsupported"
  | "non_downloadable_url"
  | "type_mismatch"
  | "source_not_found"
  | "download_failed";

export class DeckIngestError extends Error {
  constructor(
    readonly reason: DeckIngestFailureReason,
    message: string,
  ) {
    super(`${reason}: ${message}`);
    this.name = "DeckIngestError";
  }
}

const supportedExtensions = new Map<string, DeckFileType>([
  [".pdf", "pdf"],
  [".ppt", "ppt"],
  [".pptx", "pptx"],
]);

const contentTypeToFileType = new Map<string, DeckFileType>([
  ["application/pdf", "pdf"],
  ["application/vnd.ms-powerpoint", "ppt"],
  ["application/vnd.openxmlformats-officedocument.presentationml.presentation", "pptx"],
  ["application/zip", "pptx"],
]);

const pptMagic = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
const zipMagic = Buffer.from([0x50, 0x4b]);
const pdfMagic = Buffer.from("%PDF-");
const centralDirectoryMagic = 0x02014b50;

const deckIngest = defineTool({
  name: "deck_ingest",
  capability: "deck_ingest",
  provider: "show-sidekick",
  status: "beta",
  integration: {
    kind: "library",
    package: "node:fs",
    install: "Built into Node.js 22+.",
  },
  best_for: "validating PDF and PowerPoint deck sources and normalizing them into project-local working files",
  supports: ["pdf", "ppt", "pptx", "direct-download-url", "project-local-output"],
  input: inputSchema,
  output: outputSchema,
  async execute(params: DeckIngestInput, ctx): Promise<DeckIngestOutput> {
    const input = inputSchema.parse(params);
    const outputDir = resolveProjectWritePath(input.output_dir, ctx.projectRoot);
    const parsedUrl = parseUrl(input.source);

    if (parsedUrl !== undefined) {
      return outputSchema.parse(await ingestUrl(parsedUrl, input, outputDir));
    }

    return outputSchema.parse(await ingestLocal(input, ctx.projectRoot, outputDir));
  },
});

export default deckIngest;

async function ingestLocal(input: DeckIngestInput, projectRoot: string, outputDir: string): Promise<DeckIngestOutput> {
  const sourceType = fileTypeFromPath(input.source);
  ensureSupportedType(sourceType, input.source);
  ensureExpectedType(sourceType, input.expected_type, input.source);

  const sourcePath = resolveProjectReadPath(input.source, projectRoot);
  let sourceStat: Awaited<ReturnType<typeof stat>>;
  try {
    sourceStat = await stat(sourcePath);
  } catch {
    throw new DeckIngestError("source_not_found", `deck source does not exist: ${input.source}`);
  }

  if (!sourceStat.isFile()) {
    throw new DeckIngestError("source_not_found", `deck source is not a file: ${input.source}`);
  }

  const buffer = await readFile(sourcePath);
  ensureMagicMatches(sourceType, sniffFileType(buffer), input.source);

  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, safeDeckFileName(path.basename(sourcePath), sourceType));
  await copyFile(sourcePath, outputPath);

  return buildOutput({
    filePath: outputPath,
    fileType: sourceType,
    source: { kind: "local", source_path: sourcePath },
  });
}

async function ingestUrl(url: URL, input: DeckIngestInput, outputDir: string): Promise<DeckIngestOutput> {
  const authenticatedReason = authenticatedUrlReason(url);
  if (authenticatedReason !== undefined) {
    throw new DeckIngestError("authenticated_url_unsupported", authenticatedReason);
  }

  const urlExtensionType = fileTypeFromPath(url.pathname, { allowUnknown: true });
  if (urlExtensionType === undefined && path.extname(url.pathname).length > 0) {
    throw new DeckIngestError("unsupported_extension", `unsupported deck URL extension: ${path.extname(url.pathname)}`);
  }
  if (urlExtensionType !== undefined) {
    ensureExpectedType(urlExtensionType, input.expected_type, url.href);
  }

  let response: Response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DeckIngestError("download_failed", `download failed for ${url.href}: ${message}`);
  }

  if (!response.ok) {
    throw new DeckIngestError("download_failed", `download failed for ${url.href}: HTTP ${response.status}`);
  }

  const contentType = normalizeContentType(response.headers.get("content-type"));
  const contentTypeFileType = contentType === undefined ? undefined : contentTypeToFileType.get(contentType);
  if (contentType !== undefined && contentTypeFileType === undefined && contentType.startsWith("text/html")) {
    throw new DeckIngestError("non_downloadable_url", `URL returned HTML instead of a downloadable deck: ${url.href}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const sniffedType = sniffFileType(buffer);
  const fileType = contentTypeFileType ?? sniffedType ?? urlExtensionType;

  if (fileType === undefined) {
    throw new DeckIngestError("non_downloadable_url", `URL did not return a PDF or PowerPoint deck: ${url.href}`);
  }

  ensureExpectedType(fileType, input.expected_type, url.href);
  if (urlExtensionType !== undefined && urlExtensionType !== fileType) {
    throw new DeckIngestError(
      "type_mismatch",
      `URL extension suggests ${urlExtensionType}, but downloaded deck is ${fileType}`,
    );
  }
  ensureMagicMatches(fileType, sniffedType, url.href);

  await mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, safeDeckFileName(fileNameFromUrl(url) ?? `deck.${fileType}`, fileType));
  await writeFile(outputPath, buffer);

  return buildOutput({
    filePath: outputPath,
    fileType,
    source: { kind: "url", source_url: url.href },
  });
}

function parseUrl(source: string): URL | undefined {
  try {
    const parsed = new URL(source);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function authenticatedUrlReason(url: URL): string | undefined {
  const host = url.hostname.toLowerCase();
  const pathname = url.pathname.toLowerCase();

  if (host === "docs.google.com" && pathname.startsWith("/presentation")) {
    return "Google Slides sharing links require an explicit exported PDF or PowerPoint file in v1";
  }

  if (host === "drive.google.com" && !isGoogleDriveDirectDownload(url)) {
    return "Google Drive sharing links require export=download or a local exported deck file in v1";
  }

  if (
    host === "onedrive.live.com" ||
    host.endsWith(".sharepoint.com") ||
    host.endsWith(".office.com") ||
    host === "1drv.ms"
  ) {
    return "Microsoft 365, OneDrive, and SharePoint sharing links are not supported as authenticated deck sources in v1";
  }

  return undefined;
}

function isGoogleDriveDirectDownload(url: URL): boolean {
  return url.pathname === "/uc" && url.searchParams.get("export") === "download";
}

function fileTypeFromPath(inputPath: string, options: { allowUnknown?: boolean } = {}): DeckFileType | undefined {
  const extension = path.extname(inputPath).toLowerCase();
  const fileType = supportedExtensions.get(extension);
  if (fileType !== undefined) {
    return fileType;
  }

  if (options.allowUnknown === true) {
    return undefined;
  }

  throw new DeckIngestError("unsupported_extension", `unsupported deck extension: ${extension || "(none)"}`);
}

function ensureSupportedType(fileType: DeckFileType | undefined, source: string): asserts fileType is DeckFileType {
  if (fileType === undefined) {
    throw new DeckIngestError("unsupported_extension", `unsupported deck source: ${source}`);
  }
}

function ensureExpectedType(fileType: DeckFileType, expected: DeckIngestInput["expected_type"], source: string): void {
  if (expected !== "auto" && expected !== fileType) {
    throw new DeckIngestError("type_mismatch", `${source} is ${fileType}, but expected ${expected}`);
  }
}

function sniffFileType(buffer: Buffer): DeckFileType | undefined {
  if (buffer.subarray(0, pdfMagic.length).equals(pdfMagic)) {
    return "pdf";
  }

  if (buffer.subarray(0, zipMagic.length).equals(zipMagic)) {
    return "pptx";
  }

  if (buffer.subarray(0, pptMagic.length).equals(pptMagic)) {
    return "ppt";
  }

  return undefined;
}

function ensureMagicMatches(expected: DeckFileType, actual: DeckFileType | undefined, source: string): void {
  if (actual === undefined) {
    throw new DeckIngestError("type_mismatch", `could not recognize deck file signature for ${source}`);
  }

  if (expected !== actual) {
    throw new DeckIngestError("type_mismatch", `${source} has ${actual} file signature, expected ${expected}`);
  }
}

function safeDeckFileName(fileName: string, fileType: DeckFileType): string {
  const parsed = path.parse(fileName);
  const stem = parsed.name.replace(/[^A-Za-z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "deck";
  return `${stem}.${fileType}`;
}

function fileNameFromUrl(url: URL): string | undefined {
  const basename = path.basename(url.pathname);
  return basename.length > 0 && basename !== "/" ? basename : undefined;
}

function normalizeContentType(contentType: string | null): string | undefined {
  return contentType?.split(";")[0]?.trim().toLowerCase() || undefined;
}

async function buildOutput(input: {
  filePath: string;
  fileType: DeckFileType;
  source: DeckIngestOutput["source"];
}): Promise<DeckIngestOutput> {
  const buffer = await readFile(input.filePath);
  const fileStat = await stat(input.filePath);

  return {
    file_path: input.filePath,
    file_type: input.fileType,
    source: input.source,
    sha256: createHash("sha256").update(buffer).digest("hex"),
    byte_size: fileStat.size,
    page_or_slide_count: pageOrSlideCount(input.fileType, buffer),
    warnings: [],
  };
}

function pageOrSlideCount(fileType: DeckFileType, buffer: Buffer): number | undefined {
  if (fileType === "pdf") {
    return pdfPageCount(buffer);
  }

  if (fileType === "pptx") {
    return pptxSlideCount(buffer);
  }

  return undefined;
}

function pdfPageCount(buffer: Buffer): number | undefined {
  const content = buffer.toString("latin1");
  const matches = [...content.matchAll(/\/Type\s*\/Pages\b[\s\S]{0,300}?\/Count\s+(\d+)/gu)];
  const count = Number(matches.at(-1)?.[1]);
  return Number.isInteger(count) && count > 0 ? count : undefined;
}

function pptxSlideCount(buffer: Buffer): number | undefined {
  const names = new Set<string>();
  let offset = 0;

  while (offset + 46 <= buffer.length) {
    const signature = buffer.readUInt32LE(offset);
    if (signature !== centralDirectoryMagic) {
      offset += 1;
      continue;
    }

    const fileNameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const fileNameStart = offset + 46;
    const fileNameEnd = fileNameStart + fileNameLength;

    if (fileNameEnd > buffer.length) {
      break;
    }

    names.add(buffer.toString("utf8", fileNameStart, fileNameEnd));
    offset = fileNameEnd + extraLength + commentLength;
  }

  if (names.size === 0) {
    for (const match of buffer.toString("utf8").matchAll(/ppt\/slides\/slide\d+\.xml/gu)) {
      names.add(match[0]);
    }
  }

  const count = [...names].filter((name) => /^ppt\/slides\/slide\d+\.xml$/u.test(name)).length;
  return count > 0 ? count : undefined;
}
