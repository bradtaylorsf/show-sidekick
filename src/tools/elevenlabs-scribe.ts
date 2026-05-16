import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import type { Segment, Word } from "../audio/types.js";
import { defineTool } from "../registry/index.js";
import { envValue } from "../tool-support/tts-provider.js";
import { resolveProjectReadPath } from "../tool-support/paths.js";

const ENDPOINT = "https://api.elevenlabs.io/v1/speech-to-text";
const DEFAULT_MODEL = "scribe_v2";
const SEGMENT_GAP_S = 0.8;

const wordSchema = z.object({
  text: z.string(),
  start_s: z.number(),
  end_s: z.number(),
  confidence: z.number().min(0).max(1),
});

const inputSchema = z.object({
  audio_path: z.string().min(1),
  language: z.string().optional(),
  model: z.string().optional(),
});

const outputSchema = z.object({
  segments: z.array(
    z.object({
      start_s: z.number(),
      end_s: z.number(),
      text: z.string(),
      words: z.array(wordSchema),
    }),
  ),
});

export default defineTool({
  name: "elevenlabs-scribe",
  capability: "transcribe",
  provider: "elevenlabs",
  status: "beta",
  integration: {
    kind: "api",
    env: ["ELEVENLABS_API_KEY"],
    install: "set ELEVENLABS_API_KEY",
  },
  best_for: "sung vocal and music-heavy transcription with word-level timing",
  supports: ["scribe-v2", "sung-vocals", "word-timestamps"],
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const audioPath = resolveProjectReadPath(input.audio_path, ctx.projectRoot);
    const audioBytes = await readFile(audioPath);
    const body = new FormData();

    body.set("file", new Blob([audioBytes]), basename(audioPath));
    body.set("model_id", input.model ?? DEFAULT_MODEL);
    if (input.language) {
      body.set("language_code", input.language);
    }

    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "xi-api-key": envValue("ELEVENLABS_API_KEY") },
      body,
    });

    if (!response.ok) {
      throw new Error(`ElevenLabs Scribe request failed (${response.status}): ${await response.text()}`);
    }

    return outputSchema.parse(normalizeScribeResponse(await response.json()));
  },
});

export function normalizeScribeResponse(payload: unknown): { segments: Segment[] } {
  const explicitSegments = readArray(payload, "segments");
  if (explicitSegments && explicitSegments.length > 0) {
    const segments = explicitSegments
      .map((segment) => normalizeSegment(segment))
      .filter((segment): segment is Segment => segment !== undefined);

    if (segments.length > 0) {
      return { segments };
    }
  }

  const words = (readArray(payload, "words") ?? readArray(payload, "word_timestamps") ?? [])
    .map((word) => normalizeWord(word))
    .filter((word): word is Word => word !== undefined);

  return { segments: groupWords(words) };
}

function normalizeSegment(raw: unknown): Segment | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const words = (readArray(raw, "words") ?? [])
    .map((word) => normalizeWord(word))
    .filter((word): word is Word => word !== undefined);
  const start_s = readTime(raw, "start_s", "start") ?? words[0]?.start_s;
  const end_s = readTime(raw, "end_s", "end") ?? words.at(-1)?.end_s ?? start_s;
  const text = readString(raw, "text") ?? words.map((word) => word.text).join(" ");

  if (start_s === undefined || end_s === undefined) {
    return undefined;
  }

  return {
    start_s,
    end_s,
    text: text.trim(),
    words,
  };
}

function normalizeWord(raw: unknown): Word | undefined {
  if (!isRecord(raw)) {
    return undefined;
  }

  const type = readString(raw, "type");
  const text = (readString(raw, "text") ?? readString(raw, "word") ?? "").trim();
  if (text === "" || type === "spacing" || type === "audio_event") {
    return undefined;
  }

  const start_s = readTime(raw, "start_s", "start");
  const end_s = readTime(raw, "end_s", "end");
  if (start_s === undefined || end_s === undefined) {
    return undefined;
  }

  return {
    text,
    start_s,
    end_s,
    confidence: readConfidence(raw),
  };
}

function groupWords(words: Word[]): Segment[] {
  const segments: Segment[] = [];
  let current: Word[] = [];

  for (const word of words) {
    const previous = current.at(-1);
    if (previous && (word.start_s - previous.end_s > SEGMENT_GAP_S || /[.!?]$/u.test(previous.text))) {
      flushSegment(segments, current);
      current = [];
    }

    current.push(word);
  }

  flushSegment(segments, current);
  return segments;
}

function flushSegment(segments: Segment[], words: Word[]): void {
  const first = words[0];
  const last = words.at(-1);
  if (!first || !last) {
    return;
  }

  segments.push({
    start_s: first.start_s,
    end_s: last.end_s,
    text: words.map((word) => word.text).join(" "),
    words,
  });
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

function parseSeconds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function readConfidence(record: Record<string, unknown>): number {
  const direct = record.confidence ?? record.probability ?? record.score;
  const parsed = typeof direct === "number" ? direct : typeof direct === "string" ? Number(direct) : undefined;

  if (parsed !== undefined && Number.isFinite(parsed)) {
    return clampConfidence(parsed);
  }

  const logprob = record.logprob;
  if (typeof logprob === "number" && Number.isFinite(logprob)) {
    return clampConfidence(Math.exp(logprob));
  }

  return 1;
}

function clampConfidence(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
