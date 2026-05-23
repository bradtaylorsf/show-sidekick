import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/index.js";
import { resolveProjectReadPath, resolveProjectWritePath } from "../tool-support/paths.js";

const SUPPORTED_TYPES = ["pdf", "pptx", "ppt"] as const;
const DEFAULT_MAX_DOWNLOAD_MB = 200;
const MAX_REDIRECTS = 5;

export const DeckIngestInputSchema = z.object({
  source: z.string().min(1),
  output_dir: z.string().min(1),
  max_download_mb: z.number().positive().default(DEFAULT_MAX_DOWNLOAD_MB),
});

export const DeckIngestOutputSchema = z.object({
  source_kind: z.enum(["pdf", "pptx", "ppt", "download"]),
  file_type: z.enum(SUPPORTED_TYPES),
  source_path: z.string().min(1),
  original_url: z.string().url().optional(),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
  byte_size: z.number().int().nonnegative(),
  page_count: z.number().int().positive().optional(),
  slide_count: z.number().int().positive().optional(),
  warnings: z.array(z.string()),
  provenance_path: z.string().min(1),
});

export type DeckIngestInput = z.infer<typeof DeckIngestInputSchema>;
export type DeckIngestOutput = z.infer<typeof DeckIngestOutputSchema>;
export type DeckFileType = (typeof SUPPORTED_TYPES)[number];

export class DeckIngestError extends Error {
  readonly code: string;

  constructor(code: string, message: string, options: { cause?: unknown } = {}) {
    super(`${code}: ${message}`, options);
    this.name = "DeckIngestError";
    this.code = code;
  }
}

type SourceMetadata = {
  fileType: DeckFileType;
  pageCount?: number;
  slideCount?: number;
  warnings: string[];
};

type DownloadResult = {
  buffer: Buffer;
  finalUrl: string;
  status: number;
  redirects: string[];
  contentType?: string;
  contentDisposition?: string;
  classifierReason: string;
};

export function classifyLocalDeckPath(source: string): DeckFileType {
  const ext = path.extname(source).toLowerCase();

  if (ext === ".pdf") {
    return "pdf";
  }
  if (ext === ".pptx") {
    return "pptx";
  }
  if (ext === ".ppt") {
    return "ppt";
  }

  throw new DeckIngestError(
    "UNSUPPORTED_DECK_EXTENSION",
    `supported deck sources are .pdf, .ppt, .pptx, or direct downloadable URLs; got '${ext || "no extension"}'`,
  );
}

export function detectDeckFileType(input: {
  url?: string;
  contentType?: string;
  contentDisposition?: string;
  buffer: Buffer;
}): { fileType: DeckFileType; reason: string } {
  const dispositionFile = filenameFromContentDisposition(input.contentDisposition);
  const candidates = [dispositionFile, input.url].filter((candidate): candidate is string => candidate !== undefined);

  for (const candidate of candidates) {
    try {
      return { fileType: classifyLocalDeckPath(new URL(candidate).pathname), reason: "extension" };
    } catch {
      try {
        return { fileType: classifyLocalDeckPath(candidate), reason: "extension" };
      } catch {
        // Continue to content-type and magic-byte checks.
      }
    }
  }

  const contentType = input.contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (contentType === "application/pdf") {
    return { fileType: "pdf", reason: "content-type" };
  }
  if (
    contentType === "application/vnd.openxmlformats-officedocument.presentationml.presentation" ||
    contentType === "application/zip"
  ) {
    return { fileType: "pptx", reason: "content-type" };
  }
  if (contentType === "application/vnd.ms-powerpoint") {
    return { fileType: "ppt", reason: "content-type" };
  }

  if (input.buffer.subarray(0, 5).toString("ascii") === "%PDF-") {
    return { fileType: "pdf", reason: "magic-bytes" };
  }
  if (input.buffer.subarray(0, 4).toString("binary") === "PK\u0003\u0004") {
    return { fileType: "pptx", reason: "magic-bytes" };
  }
  if (input.buffer.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]))) {
    return { fileType: "ppt", reason: "magic-bytes" };
  }

  throw new DeckIngestError("UNSUPPORTED_DECK_EXTENSION", "download did not look like a PDF, PPT, or PPTX file");
}

export function countPdfPages(buffer: Buffer): number | undefined {
  const text = buffer.toString("latin1");
  const matches = text.match(/\/Type\s*\/Page\b/gu) ?? [];
  return matches.length > 0 ? matches.length : undefined;
}

export function countPptxSlides(buffer: Buffer): number | undefined {
  const names = zipEntryNames(buffer);
  const slideNumbers = new Set<number>();

  for (const name of names) {
    const match = /^ppt\/slides\/slide(\d+)\.xml$/u.exec(name);
    if (match?.[1] !== undefined) {
      slideNumbers.add(Number.parseInt(match[1], 10));
    }
  }

  return slideNumbers.size > 0 ? slideNumbers.size : undefined;
}

export function zipEntryNames(buffer: Buffer): string[] {
  const names: string[] = [];

  for (let offset = 0; offset <= buffer.length - 46; offset += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) {
      continue;
    }

    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const nameStart = offset + 46;
    const nameEnd = nameStart + nameLength;

    if (nameEnd > buffer.length) {
      break;
    }

    names.push(buffer.subarray(nameStart, nameEnd).toString("utf8"));
    offset = nameEnd + extraLength + commentLength - 1;
  }

  if (names.length > 0) {
    return names;
  }

  const latin = buffer.toString("latin1");
  const fallback = new Set<string>();
  for (const match of latin.matchAll(/ppt\/slides\/slide\d+\.xml/gu)) {
    fallback.add(match[0]);
  }
  return [...fallback];
}

export default defineTool({
  name: "deck_ingest",
  capability: "deck_ingest",
  provider: "local",
  status: "production",
  integration: {
    kind: "library",
    package: "node:fs",
    install: "No install required. Uses Node.js built-ins for local deck normalization.",
  },
  best_for:
    "Normalizing local PDF/PPT/PPTX files or direct downloadable deck URLs into project-local working files with provenance; authenticated Google Slides/Microsoft 365 links fail clearly in v1",
  supports: ["pdf", "ppt", "pptx", "direct-download-url", "presentation-demo"],
  cost: { unit: "call", usd: 0 },
  input: DeckIngestInputSchema,
  output: DeckIngestOutputSchema,

  async execute(params, ctx): Promise<DeckIngestOutput> {
    const input = DeckIngestInputSchema.parse(params);
    const outputDir = resolveProjectWritePath(input.output_dir, ctx.projectRoot);
    await mkdir(outputDir, { recursive: true });

    if (isHttpUrl(input.source)) {
      return ingestDownload(input, outputDir);
    }

    return ingestLocal(input, outputDir, ctx.projectRoot);
  },
});

async function ingestLocal(input: DeckIngestInput, outputDir: string, projectRoot: string): Promise<DeckIngestOutput> {
  const resolvedSource = resolveProjectReadPath(input.source, projectRoot);
  let fileStat;

  try {
    fileStat = await stat(resolvedSource);
  } catch (error) {
    throw new DeckIngestError("SOURCE_NOT_FOUND", `deck source does not exist: ${input.source}`, { cause: error });
  }

  if (!fileStat.isFile()) {
    throw new DeckIngestError("SOURCE_NOT_FILE", `deck source is not a file: ${input.source}`);
  }

  const fileType = classifyLocalDeckPath(resolvedSource);
  const targetPath = uniqueTargetPath(outputDir, path.basename(resolvedSource), fileType);
  await copyFile(resolvedSource, targetPath);

  const buffer = await readFile(targetPath);
  const metadata = sourceMetadata(fileType, buffer);
  return buildOutput({
    sourceKind: fileType,
    fileType,
    sourcePath: targetPath,
    buffer,
    metadata,
    provenance: {
      original_source: input.source,
      resolved_source: resolvedSource,
      source_kind: fileType,
      file_type: fileType,
      classifier_reason: "extension",
      fetched_at: undefined,
      http: undefined,
    },
  });
}

async function ingestDownload(input: DeckIngestInput, outputDir: string): Promise<DeckIngestOutput> {
  const downloaded = await downloadDeck(input.source, input.max_download_mb);
  const { fileType, reason } = detectDeckFileType({
    url: downloaded.finalUrl,
    contentType: downloaded.contentType,
    contentDisposition: downloaded.contentDisposition,
    buffer: downloaded.buffer,
  });
  const sourceName = filenameFromContentDisposition(downloaded.contentDisposition) ?? new URL(downloaded.finalUrl).pathname;
  const targetPath = uniqueTargetPath(outputDir, path.basename(sourceName), fileType);

  await writeFile(targetPath, downloaded.buffer);

  const metadata = sourceMetadata(fileType, downloaded.buffer);
  return buildOutput({
    sourceKind: "download",
    fileType,
    sourcePath: targetPath,
    originalUrl: input.source,
    buffer: downloaded.buffer,
    metadata,
    provenance: {
      original_url: input.source,
      final_url: downloaded.finalUrl,
      source_kind: "download",
      file_type: fileType,
      classifier_reason: reason || downloaded.classifierReason,
      fetched_at: new Date().toISOString(),
      http: {
        status: downloaded.status,
        redirects: downloaded.redirects,
        content_type: downloaded.contentType,
      },
    },
  });
}

async function buildOutput(input: {
  sourceKind: "pdf" | "pptx" | "ppt" | "download";
  fileType: DeckFileType;
  sourcePath: string;
  originalUrl?: string;
  buffer: Buffer;
  metadata: SourceMetadata;
  provenance: Record<string, unknown>;
}): Promise<DeckIngestOutput> {
  const sha256 = hash(input.buffer);
  const provenancePath = path.join(path.dirname(input.sourcePath), "source.json");
  const provenance = {
    ...input.provenance,
    source_path: input.sourcePath,
    sha256,
    byte_size: input.buffer.byteLength,
    warnings: input.metadata.warnings,
  };

  await writeFile(provenancePath, `${JSON.stringify(provenance, null, 2)}\n`, "utf8");

  return DeckIngestOutputSchema.parse({
    source_kind: input.sourceKind,
    file_type: input.fileType,
    source_path: input.sourcePath,
    original_url: input.originalUrl,
    sha256,
    byte_size: input.buffer.byteLength,
    page_count: input.metadata.pageCount,
    slide_count: input.metadata.slideCount,
    warnings: input.metadata.warnings,
    provenance_path: provenancePath,
  });
}

function sourceMetadata(fileType: DeckFileType, buffer: Buffer): SourceMetadata {
  if (fileType === "pdf") {
    const pageCount = countPdfPages(buffer);
    return {
      fileType,
      pageCount,
      warnings: pageCount === undefined ? ["pdf_page_count_unknown"] : [],
    };
  }

  if (fileType === "pptx") {
    const slideCount = countPptxSlides(buffer);
    return {
      fileType,
      slideCount,
      warnings: slideCount === undefined ? ["pptx_slide_count_unknown"] : [],
    };
  }

  return {
    fileType,
    warnings: ["binary_ppt_unsupported_metadata"],
  };
}

async function downloadDeck(source: string, maxDownloadMb: number): Promise<DownloadResult> {
  const redirects: string[] = [];
  let currentUrl = source;

  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    const response = await fetch(currentUrl, { redirect: "manual" });
    const location = response.headers.get("location");

    if (isRedirect(response.status)) {
      if (location === null) {
        throw new DeckIngestError("DOWNLOAD_FAILED", `redirect from ${currentUrl} did not include a Location header`);
      }

      const nextUrl = new URL(location, currentUrl).href;
      redirects.push(nextUrl);
      if (looksLikeAuthenticatedUrl(nextUrl)) {
        throw new DeckIngestError(
          "AUTHENTICATED_URL_UNSUPPORTED",
          "authenticated Google Slides, Microsoft 365, SSO, and login redirects are unsupported in v1",
        );
      }
      currentUrl = nextUrl;
      continue;
    }

    if (response.status === 401 || response.status === 403 || looksLikeAuthenticatedUrl(currentUrl)) {
      throw new DeckIngestError(
        "AUTHENTICATED_URL_UNSUPPORTED",
        "authenticated Google Slides, Microsoft 365, SSO, and login redirects are unsupported in v1",
      );
    }

    if (!response.ok) {
      throw new DeckIngestError("DOWNLOAD_FAILED", `download failed with HTTP ${response.status}`);
    }

    const contentLength = numberHeader(response.headers.get("content-length"));
    const maxBytes = Math.floor(maxDownloadMb * 1024 * 1024);
    if (contentLength !== undefined && contentLength > maxBytes) {
      throw new DeckIngestError("DOWNLOAD_TOO_LARGE", `download is ${contentLength} bytes; max is ${maxBytes} bytes`);
    }

    const contentType = response.headers.get("content-type") ?? undefined;
    const contentDisposition = response.headers.get("content-disposition") ?? undefined;
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      throw new DeckIngestError("DOWNLOAD_TOO_LARGE", `download is ${buffer.byteLength} bytes; max is ${maxBytes} bytes`);
    }
    if (isHtmlResponse(contentType, buffer)) {
      const code = looksLikeLoginHtml(buffer) ? "AUTHENTICATED_URL_UNSUPPORTED" : "NON_DOWNLOADABLE_URL";
      throw new DeckIngestError(code, "URL returned HTML instead of a downloadable PDF/PPT/PPTX deck");
    }

    return {
      buffer,
      finalUrl: currentUrl,
      status: response.status,
      redirects,
      contentType,
      contentDisposition,
      classifierReason: "download-response",
    };
  }

  throw new DeckIngestError("TOO_MANY_REDIRECTS", `download exceeded ${MAX_REDIRECTS} redirects`);
}

function uniqueTargetPath(outputDir: string, basename: string, fileType: DeckFileType): string {
  const parsed = path.parse(basename);
  const safeName = sanitizeFileName(parsed.name || "deck");
  const ext = parsed.ext.toLowerCase() === `.${fileType}` ? parsed.ext.toLowerCase() : `.${fileType}`;
  return path.join(outputDir, `${safeName}${ext}`);
}

function sanitizeFileName(name: string): string {
  const sanitized = name.replace(/[^a-zA-Z0-9._-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return sanitized.length > 0 ? sanitized : "deck";
}

function filenameFromContentDisposition(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const star = /filename\*=UTF-8''([^;]+)/iu.exec(value);
  if (star?.[1] !== undefined) {
    return decodeURIComponent(star[1].trim().replace(/^"|"$/gu, ""));
  }

  const quoted = /filename="?([^";]+)"?/iu.exec(value);
  return quoted?.[1]?.trim();
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function isRedirect(status: number): boolean {
  return status >= 300 && status < 400;
}

function looksLikeAuthenticatedUrl(value: string): boolean {
  const lower = value.toLowerCase();
  return (
    lower.includes("accounts.google.") ||
    lower.includes("login.microsoftonline.") ||
    lower.includes("login.live.") ||
    lower.includes("sharepoint.com") ||
    lower.includes("office.com") ||
    lower.includes("microsoft.com/login") ||
    lower.includes("saml") ||
    lower.includes("sso") ||
    lower.includes("/login") ||
    lower.includes("/signin")
  );
}

function isHtmlResponse(contentType: string | undefined, buffer: Buffer): boolean {
  const declaredHtml = contentType?.toLowerCase().includes("text/html") === true;
  const prefix = buffer.subarray(0, 256).toString("utf8").trimStart().toLowerCase();
  return declaredHtml || prefix.startsWith("<!doctype html") || prefix.startsWith("<html");
}

function looksLikeLoginHtml(buffer: Buffer): boolean {
  const text = buffer.subarray(0, 4096).toString("utf8").toLowerCase();
  return text.includes("sign in") || text.includes("signin") || text.includes("login") || text.includes("sso");
}

function numberHeader(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function hash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
