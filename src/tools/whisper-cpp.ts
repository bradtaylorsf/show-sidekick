import { execFile } from "node:child_process";
import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, extname, join } from "node:path";
import { z } from "zod";
import type { Segment, Word } from "../audio/types.js";
import { defineTool } from "../registry/index.js";
import { findWhisperCli, resolveWhisperModel, whisperCliCandidates } from "../tool-support/whisper.js";

const WHISPER_CPP_INSTALL =
  "brew install whisper-cpp (macOS) or build from https://github.com/ggerganov/whisper.cpp; ensure whisper-cli is on PATH (or set WHISPER_CLI) and provide a model via WHISPER_MODEL or ~/.cache/whisper";

const wordSchema = z.object({
  text: z.string(),
  start_s: z.number(),
  end_s: z.number(),
  confidence: z.number(),
});

export default defineTool({
  name: "whisper-cpp",
  capability: "whisper",
  provider: "whisper-cpp",
  status: "production",
  integration: {
    kind: "binary",
    binary: "whisper-cli",
    install: WHISPER_CPP_INSTALL,
  },
  best_for:
    "local word-level ASR; default medium.en for English, medium for other languages, large-v3 retry for music-heavy audio",
  input: z.object({
    audio_path: z.string(),
    language: z.string().optional(),
    model: z.string().optional(),
  }),
  output: z.object({
    segments: z.array(
      z.object({
        start_s: z.number(),
        end_s: z.number(),
        text: z.string(),
        words: z.array(wordSchema),
      }),
    ),
  }),
  async isAvailable(ctx) {
    const binary = await findWhisperCli();
    if (binary === undefined) {
      return { available: false, reason: `binary not on PATH: ${whisperCliCandidates().join(" or ")}`, fix: "install" };
    }

    const model = resolveWhisperModel(undefined, { projectRoot: ctx?.projectRoot });
    if (!model.ok) {
      return { available: false, reason: model.reason, fix: "env" };
    }

    return { available: true };
  },
  async execute(params, ctx) {
    const model = resolveWhisperModel(params.model, { projectRoot: ctx.projectRoot });
    if (!model.ok) {
      throw new Error(model.reason);
    }

    const tempDir = await mkdtemp(join(tmpdir(), "show-sidekick-whisper-"));
    const extension = extname(params.audio_path);
    const tempAudioPath = join(tempDir, `input${extension || ".audio"}`);
    const outputBase = join(tempDir, "transcript");

    try {
      await copyFile(params.audio_path, tempAudioPath);
      await runWhisperCli(
        buildWhisperArgs({ ...params, model: model.path }, tempAudioPath, outputBase),
        params.audio_path,
      );
      const json = await readWhisperJson([`${outputBase}.json`, `${tempAudioPath}.json`, join(tempDir, `${basename(tempAudioPath, extension)}.json`)]);

      return parseWhisperJson(json);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  },
});

type WhisperInput = {
  audio_path: string;
  language?: string;
  model?: string;
};

const WHISPER_MAX_BUFFER = 16 * 1024 * 1024;
const WHISPER_TIMEOUT_MS = 10 * 60_000;

/**
 * argv for whisper-cli. Boolean flags take no value in whisper.cpp: a trailing
 * `false` is parsed as a second input file. `--output-json-full` carries the
 * token timings the parser reads; `--output-words` (a karaoke script) is not needed.
 */
export function buildWhisperArgs(params: WhisperInput & { model: string }, audioPath: string, outputBase: string): string[] {
  const args = ["--model", params.model, "--file", audioPath, "--output-json-full", "--output-file", outputBase];

  if (params.language) {
    args.push("--language", params.language);
  }

  return args;
}

async function runWhisperCli(args: string[], sourceAudioPath: string): Promise<void> {
  const candidates = whisperCliCandidates();

  for (const binary of candidates) {
    const result = await execWhisperCli(binary, args);
    if (result.ok) {
      return;
    }

    if (isMissingBinary(result.error)) {
      continue;
    }

    throw new Error(
      `${binary} failed for ${sourceAudioPath}: ${result.error.message}${result.stderr ? `\n${result.stderr}` : ""}`,
    );
  }

  throw new Error(`whisper-cli binary not on PATH (tried ${candidates.join(", ")}). Install: ${WHISPER_CPP_INSTALL}`);
}

function execWhisperCli(
  binary: string,
  args: string[],
): Promise<{ ok: true } | { ok: false; error: Error; stderr: string }> {
  return new Promise((resolve) => {
    execFile(
      binary,
      args,
      { encoding: "utf8", maxBuffer: WHISPER_MAX_BUFFER, timeout: WHISPER_TIMEOUT_MS },
      (error, _stdout, stderr) => {
        resolve(error ? { ok: false, error, stderr } : { ok: true });
      },
    );
  });
}

async function readWhisperJson(candidates: string[]): Promise<string> {
  for (const candidate of candidates) {
    try {
      return await readFile(candidate, "utf8");
    } catch {
      // whisper.cpp output naming differs by version; try the next likely path.
    }
  }

  throw new Error(`whisper-cli did not produce JSON output at: ${candidates.join(", ")}`);
}

export function parseWhisperJson(json: string): { segments: Segment[] } {
  const parsed = JSON.parse(json) as unknown;
  const rawSegments = readArray(parsed, "segments") ?? readArray(parsed, "transcription");

  if (!rawSegments) {
    throw new Error("whisper-cli JSON did not include segments or transcription");
  }

  return {
    segments: rawSegments.map((segment) => normalizeSegment(segment)).filter((segment): segment is Segment => segment !== undefined),
  };
}

function normalizeSegment(raw: unknown): Segment | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const explicitWords = readArray(raw, "words");
  const words = explicitWords
    ? explicitWords.map((word) => normalizeWord(word, raw)).filter((word): word is Word => word !== undefined)
    : mergeSubwordTokens(readArray(raw, "tokens") ?? [], raw);
  const start_s = readTime(raw, "start_s", "start", "from") ?? readNestedTime(raw, "offsets", "from", 1000) ?? readNestedTime(raw, "timestamps", "from");
  const end_s = readTime(raw, "end_s", "end", "to") ?? readNestedTime(raw, "offsets", "to", 1000) ?? readNestedTime(raw, "timestamps", "to");
  const text = readString(raw, "text") ?? words.map((word) => word.text).join(" ");
  const firstWord = words[0];
  const lastWord = words.at(-1);

  return {
    start_s: start_s ?? firstWord?.start_s ?? 0,
    end_s: end_s ?? lastWord?.end_s ?? start_s ?? 0,
    text: text.trim(),
    words,
  };
}

/**
 * whisper.cpp `--output-json-full` tokens are BPE pieces (" Hel", "lo", ","), not words.
 * A piece without leading whitespace continues the previous word.
 */
function mergeSubwordTokens(rawTokens: unknown[], parentSegment: Record<string, unknown>): Word[] {
  const words: Word[] = [];

  for (const rawToken of rawTokens) {
    const token = normalizeWord(rawToken, parentSegment);
    if (token === undefined) {
      continue;
    }

    const rawText = isRecord(rawToken) ? (readString(rawToken, "text") ?? readString(rawToken, "word") ?? "") : "";
    const previous = words.at(-1);
    if (previous !== undefined && rawText !== "" && !/^\s/u.test(rawText)) {
      previous.text += token.text;
      previous.end_s = Math.max(previous.end_s, token.end_s);
      previous.confidence = Math.min(previous.confidence, token.confidence);
      continue;
    }

    words.push(token);
  }

  return words;
}

function normalizeWord(raw: unknown, parentSegment: Record<string, unknown>): Word | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const text = (readString(raw, "text") ?? readString(raw, "word") ?? "").trim();
  if (!text || /^\[[^\]]+\]$/u.test(text)) {
    return undefined;
  }

  const start_s =
    readTime(raw, "start_s", "start", "from") ??
    readNestedTime(raw, "offsets", "from", 1000) ??
    readNestedTime(raw, "timestamps", "from") ??
    readTime(parentSegment, "start_s", "start", "from") ??
    readNestedTime(parentSegment, "offsets", "from", 1000) ??
    readNestedTime(parentSegment, "timestamps", "from") ??
    0;
  const end_s =
    readTime(raw, "end_s", "end", "to") ??
    readNestedTime(raw, "offsets", "to", 1000) ??
    readNestedTime(raw, "timestamps", "to") ??
    readTime(parentSegment, "end_s", "end", "to") ??
    readNestedTime(parentSegment, "offsets", "to", 1000) ??
    readNestedTime(parentSegment, "timestamps", "to") ??
    start_s;

  return {
    text,
    start_s,
    end_s,
    confidence: readConfidence(raw),
  };
}

function readArray(record: unknown, key: string): unknown[] | undefined {
  if (!isRecord(record)) {
    return undefined;
  }

  const value = record[key];
  return Array.isArray(value) ? value : undefined;
}

function readString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key];
  return typeof value === "string" ? value : undefined;
}

function readTime(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const parsed = parseSeconds(record[key]);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function readNestedTime(record: Record<string, unknown>, parentKey: string, childKey: string, divisor = 1): number | undefined {
  const parent = record[parentKey];
  if (!isRecord(parent)) {
    return undefined;
  }

  const parsed = parseSeconds(parent[childKey]);
  return parsed === undefined ? undefined : parsed / divisor;
}

function parseSeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value !== "string") {
    return undefined;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return numeric;
  }

  const match = /^(?:(\d+):)?(\d{2}):(\d{2})[,.](\d{3})$/u.exec(value);
  if (!match) {
    return undefined;
  }

  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4]);
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function readConfidence(record: Record<string, unknown>): number {
  const value = record.confidence ?? record.probability ?? record.p;
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(parsed)) {
    return 1;
  }

  return Math.max(0, Math.min(1, parsed));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isMissingBinary(error: Error): error is NodeJS.ErrnoException {
  return "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}
