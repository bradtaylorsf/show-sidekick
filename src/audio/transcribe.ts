import type { DecisionEntry } from "../artifacts/decision-log.js";
import type { Registry, Tool, ToolContext, ToolLogger } from "../registry/index.js";
import { NoToolAvailable } from "../registry/index.js";
import * as defaultLogger from "../log/logger.js";
import whisperCpp from "../tools/whisper-cpp.js";
import type { AudioTrack, Segment } from "./types.js";

export interface TranscribeOptions {
  language?: string;
  model?: string;
  prefer?: string[];
  registry?: Pick<Registry, "select">;
  logger?: ToolLogger;
  projectRoot?: string;
  recordDecision?: (entry: DecisionEntry) => Promise<void> | void;
  decisionStage?: string;
  decisionTimestamp?: string;
}

export interface Transcription {
  segments: Segment[];
  average_confidence: number;
  low_confidence: boolean;
}

type TranscribeToolInput = {
  audio_path: string;
  language?: string;
  model?: string;
};

type TranscribeToolOutput = {
  segments: Segment[];
};

const LOW_CONFIDENCE_THRESHOLD = 0.8;
const RETRY_TOKEN_RATIO = 0.2;
const LARGE_RETRY_MODEL = "large-v3";

export async function transcribe(track: AudioTrack, options: TranscribeOptions = {}): Promise<Transcription> {
  const logger = options.logger ?? defaultLogger;
  const initialModel = options.model ?? defaultModelForLanguage(options.language);
  const ctx: ToolContext = {
    projectRoot: options.projectRoot ?? process.cwd(),
    logger,
  };
  const tool = await selectTranscriptionTool(options);
  const initial = await runTool(tool, track, options, initialModel, ctx);
  const retry = shouldRetryWithLarge(initial.segments);

  if (retry.shouldRetry && initialModel !== LARGE_RETRY_MODEL) {
    const decision = buildRetryDecision(tool, initialModel, retry, options);

    logger.event("provider_selection", {
      picked: LARGE_RETRY_MODEL,
      reason: retry.reason,
      initial: initialModel,
      ratio: retry.ratio,
      music_symbol_ratio: retry.musicSymbolRatio,
      garbled_ratio: retry.garbledRatio,
    });
    await options.recordDecision?.(decision);

    return summarize(await runTool(tool, track, options, LARGE_RETRY_MODEL, ctx));
  }

  return summarize(initial);
}

function defaultModelForLanguage(language: string | undefined): string {
  return language === undefined || /^en(?:-|$)/iu.test(language) ? "medium.en" : "medium";
}

async function selectTranscriptionTool(options: TranscribeOptions): Promise<Tool<TranscribeToolInput, TranscribeToolOutput>> {
  if (!options.registry) {
    return whisperCpp;
  }

  const alternative = await selectFirstAvailable(options.registry, ["transcribe", "transcriber", "asr"], options.prefer);
  if (alternative) {
    return alternative;
  }

  return (await options.registry.select("whisper", { prefer: options.prefer })) as Tool<TranscribeToolInput, TranscribeToolOutput>;
}

async function selectFirstAvailable(
  registry: Pick<Registry, "select">,
  capabilities: string[],
  prefer: string[] | undefined,
): Promise<Tool<TranscribeToolInput, TranscribeToolOutput> | undefined> {
  for (const capability of capabilities) {
    try {
      const tool = await registry.select(capability, { prefer });
      if (isProviderSelectionMarker(tool)) {
        continue;
      }

      return tool as Tool<TranscribeToolInput, TranscribeToolOutput>;
    } catch (error) {
      if (!(error instanceof NoToolAvailable)) {
        throw error;
      }
    }
  }

  return undefined;
}

function isProviderSelectionMarker(tool: Tool): boolean {
  return tool.provider === "predit" && (tool.supports ?? []).includes("provider-selection");
}

async function runTool(
  tool: Tool<TranscribeToolInput, TranscribeToolOutput>,
  track: AudioTrack,
  options: TranscribeOptions,
  model: string,
  ctx: ToolContext,
): Promise<TranscribeToolOutput> {
  return tool.execute(
    {
      audio_path: track.path,
      ...(options.language === undefined ? {} : { language: options.language }),
      model,
    },
    ctx,
  );
}

function summarize(result: TranscribeToolOutput): Transcription {
  const confidences = result.segments.flatMap((segment) => segment.words.map((word) => word.confidence));
  const average_confidence =
    confidences.length === 0 ? 1 : confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length;

  return {
    segments: result.segments,
    average_confidence,
    low_confidence: average_confidence < LOW_CONFIDENCE_THRESHOLD,
  };
}

function shouldRetryWithLarge(segments: Segment[]): {
  shouldRetry: boolean;
  ratio: number;
  musicSymbolRatio: number;
  garbledRatio: number;
  reason: string;
} {
  const tokens = transcriptTokens(segments);
  if (tokens.length === 0) {
    return { shouldRetry: false, ratio: 0, musicSymbolRatio: 0, garbledRatio: 0, reason: "token_ratio<=0.20" };
  }

  const musicSymbolCount = tokens.filter((token) => token.includes("♪")).length;
  const garbledCount = tokens.filter(isGarbledToken).length;
  const musicSymbolRatio = musicSymbolCount / tokens.length;
  const garbledRatio = garbledCount / tokens.length;
  const ratio = (musicSymbolCount + garbledCount) / tokens.length;

  if (musicSymbolRatio > RETRY_TOKEN_RATIO) {
    return { shouldRetry: true, ratio, musicSymbolRatio, garbledRatio, reason: "music_symbol_ratio>0.20" };
  }

  if (garbledRatio > RETRY_TOKEN_RATIO) {
    return { shouldRetry: true, ratio, musicSymbolRatio, garbledRatio, reason: "garbled_token_ratio>0.20" };
  }

  if (ratio > RETRY_TOKEN_RATIO) {
    return { shouldRetry: true, ratio, musicSymbolRatio, garbledRatio, reason: "music_or_garbled_token_ratio>0.20" };
  }

  return { shouldRetry: false, ratio, musicSymbolRatio, garbledRatio, reason: "token_ratio<=0.20" };
}

function transcriptTokens(segments: Segment[]): string[] {
  const words = segments.flatMap((segment) => segment.words);
  if (words.length > 0) {
    return words.map((word) => word.text).filter((text) => text.trim() !== "");
  }

  return segments.flatMap((segment) => tokenize(segment.text));
}

function tokenize(text: string): string[] {
  return text.split(/\s+/u).filter((token) => token.trim() !== "");
}

function isGarbledToken(token: string): boolean {
  const trimmed = token.trim();

  return (
    trimmed.includes("�") ||
    /^\?{2,}$/u.test(trimmed) ||
    /[^\p{L}\p{N}\s♪'"’.,!?;:()\-]{2,}/u.test(trimmed) ||
    hasLongConsonantRun(trimmed)
  );
}

function hasLongConsonantRun(token: string): boolean {
  const normalized = token.toLowerCase().replace(/[^a-z]/gu, "");
  return /[bcdfghjklmnpqrstvwxyz]{8,}/u.test(normalized);
}

function buildRetryDecision(
  tool: Tool<TranscribeToolInput, TranscribeToolOutput>,
  initialModel: string,
  retry: ReturnType<typeof shouldRetryWithLarge>,
  options: TranscribeOptions,
): DecisionEntry {
  const timestamp = options.decisionTimestamp ?? new Date().toISOString();
  const picked = `${tool.name}:${LARGE_RETRY_MODEL}`;

  return {
    id: `transcription_retry-${safeTimestamp(timestamp)}`,
    stage: options.decisionStage ?? "cuesheet",
    timestamp,
    category: "provider_selection",
    scope: {
      capability: "transcribe",
      provider: tool.provider,
    },
    options_considered: [
      {
        label: `${tool.name}:${initialModel}`,
        rejected_because: `retry required: ${retry.reason}; music_symbol_ratio=${retry.musicSymbolRatio.toFixed(
          3,
        )}; garbled_ratio=${retry.garbledRatio.toFixed(3)}`,
      },
      {
        label: picked,
        rejected_because: null,
        notes: "larger local whisper model selected after the initial transcript looked music-heavy or garbled",
      },
    ],
    picked,
    reason: `Initial ${initialModel} transcript exceeded the retry threshold (${retry.reason}); reran ASR with ${LARGE_RETRY_MODEL}.`,
    confidence: confidenceFromRetryRatio(retry.ratio),
    user_visible: true,
    supersedes: null,
  };
}

function confidenceFromRetryRatio(ratio: number): number {
  return Math.round(Math.max(0.5, Math.min(0.95, 1 - ratio / 2)) * 1000) / 1000;
}

function safeTimestamp(timestamp: string): string {
  return timestamp.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "");
}
