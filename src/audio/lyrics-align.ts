import { LyricsAlignedSchema, type LyricAlignedLine, type LyricsAligned } from "../artifacts/lyrics-aligned.js";
import type { LyricsAlignmentOverride, LyricsAlignmentOverrides } from "../artifacts/lyrics-alignment-overrides.js";
import type { Segment, Word } from "./types.js";

export interface AlignLyricsOptions {
  min_confidence?: number;
  gap_close_s?: number;
  source?: LyricsAligned["source"];
}

type WordRef = {
  id: string;
  index: number;
  normalized: string;
  word: Word;
};

type MatchResult = {
  refs: WordRef[];
  confidence: number;
};

const DEFAULT_MIN_CONFIDENCE = 0.6;
const DEFAULT_GAP_CLOSE_S = 0.15;

export function alignLyrics(canonicalLyrics: string, segments: Segment[], options: AlignLyricsOptions = {}): LyricsAligned {
  const minConfidence = options.min_confidence ?? DEFAULT_MIN_CONFIDENCE;
  const lines = parseLyricLines(canonicalLyrics);
  const words = flattenWords(segments);
  const aligned: LyricAlignedLine[] = [];
  let cursor = 0;

  for (const line of lines) {
    const tokens = tokenize(line);
    const match = tokens.length === 0 ? { refs: [], confidence: 0 } : matchTokens(tokens, words, cursor);
    const lyricLine = lineFromMatch(aligned.length, line, match, minConfidence);

    aligned.push(lyricLine);

    const lastRef = match.refs.at(-1);
    if (lastRef !== undefined && match.confidence >= minConfidence) {
      cursor = lastRef.index + 1;
    }
  }

  closeTinyGaps(aligned, options.gap_close_s ?? DEFAULT_GAP_CLOSE_S);

  return LyricsAlignedSchema.parse({
    source: options.source ?? "transcript_words",
    lines: aligned,
  });
}

export function applyManualCorrections(
  aligned: LyricsAligned,
  overrides: LyricsAlignmentOverrides | undefined,
): LyricsAligned {
  if (overrides === undefined || overrides.overrides.length === 0) {
    return LyricsAlignedSchema.parse(aligned);
  }

  const lines = aligned.lines.map((line) => ({ ...line }));

  for (const override of overrides.overrides) {
    const index = findOverrideLineIndex(lines, override);
    if (index === undefined) {
      throw new Error(`No lyric alignment line matched override ${describeOverride(override)}`);
    }

    const line = lines[index] as LyricAlignedLine;
    const startMs = overrideMs(override.start_ms, override.start_s) ?? line.start_ms;
    const endMs = overrideMs(override.end_ms, override.end_s) ?? line.end_ms;

    lines[index] = {
      ...line,
      start_ms: startMs,
      end_ms: endMs,
      start_s: startMs === null ? null : msToSeconds(startMs),
      end_s: endMs === null ? null : msToSeconds(endMs),
      source: "manual-correction",
      original_source: line.source === "manual-correction" ? line.original_source : line.source,
      flagged: false,
    };
  }

  return LyricsAlignedSchema.parse({
    source: sourceAfterCorrections(lines, aligned.source),
    lines,
  });
}

export function canonicalLyricsFromEpisodeInputs(inputs: Record<string, unknown>): string | undefined {
  for (const key of ["canonical_lyrics", "lyrics_text", "lyrics"]) {
    const value = inputs[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value;
    }

    if (isRecord(value)) {
      const text = value.text;
      if (typeof text === "string" && text.trim() !== "") {
        return text;
      }
    }
  }

  return undefined;
}

function parseLyricLines(canonicalLyrics: string): string[] {
  return canonicalLyrics
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter((line) => line !== "" && !/^\[[^\]]+\]$/u.test(line));
}

function flattenWords(segments: Segment[]): WordRef[] {
  let index = 0;

  return segments.flatMap((segment) =>
    segment.words.flatMap((word) => {
      const normalized = normalizeToken(word.text);
      if (normalized === "") {
        return [];
      }

      index += 1;
      return [
        {
          id: wordId(word, index),
          index: index - 1,
          normalized,
          word,
        },
      ];
    }),
  );
}

function matchTokens(tokens: string[], words: WordRef[], cursor: number): MatchResult {
  let best: MatchResult = { refs: [], confidence: 0 };

  for (let start = cursor; start < words.length; start += 1) {
    const refs: WordRef[] = [];
    let tokenIndex = 0;

    for (let wordIndex = start; wordIndex < words.length && tokenIndex < tokens.length; wordIndex += 1) {
      const word = words[wordIndex] as WordRef;
      if (word.normalized === tokens[tokenIndex]) {
        refs.push(word);
        tokenIndex += 1;
      }
    }

    const confidence = refs.length / tokens.length;
    if (confidence > best.confidence || (confidence === best.confidence && startsEarlier(refs, best.refs))) {
      best = { refs, confidence };
    }

    if (confidence === 1) {
      break;
    }
  }

  return best;
}

function lineFromMatch(index: number, text: string, match: MatchResult, minConfidence: number): LyricAlignedLine {
  const first = match.refs[0];
  const last = match.refs.at(-1);
  const confidence = roundConfidence(match.confidence);
  const flagged = confidence < minConfidence;

  if (first === undefined || last === undefined) {
    return {
      id: `line-${index + 1}`,
      text,
      confidence: 0,
      matched_word_ids: [],
      start_s: null,
      end_s: null,
      start_ms: null,
      end_ms: null,
      source: "unmatched",
      flagged: true,
    };
  }

  return {
    id: `line-${index + 1}`,
    text,
    confidence,
    matched_word_ids: match.refs.map((ref) => ref.id),
    start_s: roundSeconds(first.word.start_s),
    end_s: roundSeconds(last.word.end_s),
    start_ms: secondsToMs(first.word.start_s),
    end_ms: secondsToMs(last.word.end_s),
    source: "aligned",
    flagged,
  };
}

function closeTinyGaps(lines: LyricAlignedLine[], gapCloseS: number): void {
  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = lines[index] as LyricAlignedLine;
    const next = lines[index + 1] as LyricAlignedLine;

    if (
      current.source === "unmatched" ||
      next.source === "unmatched" ||
      current.end_s === null ||
      next.start_s === null
    ) {
      continue;
    }

    const gap = next.start_s - current.end_s;
    if (gap > 0 && gap <= gapCloseS) {
      current.end_s = next.start_s;
      current.end_ms = next.start_ms;
      current.source = "gap_filled";
    }
  }
}

function tokenize(text: string): string[] {
  return text
    .split(/\s+/u)
    .map(normalizeToken)
    .filter((token) => token !== "");
}

function normalizeToken(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/gu, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function wordId(word: Word, fallbackIndex: number): string {
  const candidate = (word as Word & { id?: unknown }).id;
  return typeof candidate === "string" && candidate.trim() !== "" ? candidate : `w-${fallbackIndex}`;
}

function startsEarlier(left: WordRef[], right: WordRef[]): boolean {
  const leftStart = left[0]?.index ?? Number.MAX_SAFE_INTEGER;
  const rightStart = right[0]?.index ?? Number.MAX_SAFE_INTEGER;
  return leftStart < rightStart;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function msToSeconds(value: number): number {
  return roundSeconds(value / 1000);
}

function secondsToMs(value: number): number {
  return Math.round(value * 1000);
}

function roundConfidence(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findOverrideLineIndex(
  lines: readonly LyricAlignedLine[],
  override: LyricsAlignmentOverride,
): number | undefined {
  if (override.line_id !== undefined) {
    const index = lines.findIndex((line) => line.id === override.line_id);
    if (index >= 0) {
      return index;
    }
  }

  if (override.line_index !== undefined && override.line_index < lines.length) {
    return override.line_index;
  }

  return undefined;
}

function overrideMs(valueMs: number | undefined, valueS: number | undefined): number | undefined {
  if (valueMs !== undefined) {
    return valueMs;
  }

  return valueS === undefined ? undefined : secondsToMs(valueS);
}

function sourceAfterCorrections(lines: readonly LyricAlignedLine[], previousSource: LyricsAligned["source"]): LyricsAligned["source"] {
  const hasManual = lines.some((line) => line.source === "manual" || line.source === "manual-correction");
  if (!hasManual) {
    return previousSource;
  }

  return lines.every((line) => line.source === "manual" || line.source === "manual-correction") ? "manual" : "mixed";
}

function describeOverride(override: LyricsAlignmentOverride): string {
  if (override.line_id !== undefined) {
    return `line_id=${override.line_id}`;
  }

  return `line_index=${override.line_index ?? "unknown"}`;
}
