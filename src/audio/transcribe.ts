import type { DecisionEntry } from "../artifacts/decision-log.js";
import type { Registry, Tool, ToolContext, ToolLogger } from "../registry/index.js";
import { NoToolAvailable } from "../registry/index.js";
import * as defaultLogger from "../log/logger.js";
import whisperCpp from "../tools/whisper-cpp.js";
import { configuredWhisperModel, transcriptionProviderPin, TRANSCRIPTION_PROVIDER_ENV } from "../tool-support/whisper.js";
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
  const ctx: ToolContext = {
    projectRoot: options.projectRoot ?? process.cwd(),
    logger,
  };
  const selection = await selectTranscriptionTool(options);
  const tool = selection.tool;
  await recordProviderSelection(selection, options, logger);

  if (!isLocalWhisper(tool)) {
    // Whisper model names (medium.en, large-v3, WHISPER_MODEL paths) mean nothing to other providers.
    const model = options.model !== undefined && !looksLikeWhisperModel(options.model) ? options.model : undefined;
    return summarize(await runTool(tool, track, options, model, ctx));
  }

  // With WHISPER_MODEL set the tool resolves it; otherwise pick the language default.
  const initialModel = options.model ?? (configuredWhisperModel() === undefined ? defaultModelForLanguage(options.language) : undefined);
  const initialLabel = initialModel ?? configuredWhisperModel() ?? "default";
  const initial = await runTool(tool, track, options, initialModel, ctx);
  const retry = shouldRetryWithLarge(initial.segments);

  if (retry.shouldRetry && initialModel !== LARGE_RETRY_MODEL) {
    let retried: TranscribeToolOutput;
    try {
      retried = await runTool(tool, track, options, LARGE_RETRY_MODEL, ctx);
    } catch (error) {
      // A missing large-v3 model should not throw away a usable first pass.
      logger.warn(
        `transcription retry with ${LARGE_RETRY_MODEL} failed; keeping the ${initialLabel} transcript: ${errorMessage(error)}`,
      );
      return summarize(initial);
    }

    logger.event("provider_selection", {
      picked: LARGE_RETRY_MODEL,
      reason: retry.reason,
      initial: initialLabel,
      ratio: retry.ratio,
      music_symbol_ratio: retry.musicSymbolRatio,
      garbled_ratio: retry.garbledRatio,
    });
    await options.recordDecision?.(buildRetryDecision(tool, initialLabel, retry, options));

    return summarize(retried);
  }

  return summarize(initial);
}

function defaultModelForLanguage(language: string | undefined): string {
  return language === undefined || /^en(?:-|$)/iu.test(language) ? "medium.en" : "medium";
}

type SelectionWhy = "default" | "pinned" | "preferred" | "fallback";

type TranscriptionSelection = {
  tool: Tool<TranscribeToolInput, TranscribeToolOutput>;
  why: SelectionWhy;
  pin?: string;
  preferred?: string[];
  /** Why the local whisper path was skipped, when it was. */
  whisperUnavailable?: string;
};

const ALTERNATIVE_CAPABILITIES = ["transcribe", "transcriber", "asr"];
const WHISPER_PREFERENCES = new Set(["whisper", "whisper-cpp", "transcriber", "transcribe", "asr"]);

/**
 * Local whisper.cpp is the default (specs/07-audio-subsystem.md). Another provider is
 * used only when TRANSCRIPTION_PROVIDER pins it, the caller prefers it, or whisper is
 * unavailable. Having an API key for some other capability never switches providers.
 */
async function selectTranscriptionTool(options: TranscribeOptions): Promise<TranscriptionSelection> {
  if (!options.registry) {
    return { tool: whisperCpp, why: "default" };
  }

  const registry = options.registry;
  const pin = transcriptionProviderPin();

  if (pin === "whisper-cpp") {
    return { tool: await selectWhisper(registry, [pin]), why: "pinned", pin };
  }

  if (pin !== undefined) {
    const pinned = await selectFirstAvailable(registry, ALTERNATIVE_CAPABILITIES, [pin]);
    if (pinned === undefined || pinned.name !== pin) {
      throw new Error(
        `${TRANSCRIPTION_PROVIDER_ENV}=${pin} but ${pin} is not available; check its API key or unset ${TRANSCRIPTION_PROVIDER_ENV} to use local whisper-cpp`,
      );
    }
    return { tool: pinned, why: "pinned", pin };
  }

  const preferred = options.prefer?.filter((name) => !WHISPER_PREFERENCES.has(name)) ?? [];
  if (preferred.length > 0) {
    const alternative = await selectFirstAvailable(registry, ALTERNATIVE_CAPABILITIES, options.prefer);
    if (alternative) {
      return { tool: alternative, why: "preferred", preferred };
    }
    return { tool: await selectWhisper(registry, options.prefer), why: "default", preferred };
  }

  try {
    return { tool: await selectWhisper(registry, options.prefer), why: "default" };
  } catch (error) {
    if (!(error instanceof NoToolAvailable)) {
      throw error;
    }

    const alternative = await selectFirstAvailable(registry, ALTERNATIVE_CAPABILITIES, options.prefer);
    if (!alternative) {
      throw error;
    }
    return { tool: alternative, why: "fallback", whisperUnavailable: error.message };
  }
}

async function selectWhisper(
  registry: Pick<Registry, "select">,
  prefer: string[] | undefined,
): Promise<Tool<TranscribeToolInput, TranscribeToolOutput>> {
  return (await registry.select("whisper", { prefer })) as Tool<TranscribeToolInput, TranscribeToolOutput>;
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

function isLocalWhisper(tool: Tool): boolean {
  return tool.capability === "whisper";
}

function looksLikeWhisperModel(model: string): boolean {
  return /^(?:tiny|base|small|medium|large)(?:[.-]|$)/iu.test(model) || model.endsWith(".bin") || model.includes("/");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isProviderSelectionMarker(tool: Tool): boolean {
  return tool.provider === "show-sidekick" && (tool.supports ?? []).includes("provider-selection");
}

async function runTool(
  tool: Tool<TranscribeToolInput, TranscribeToolOutput>,
  track: AudioTrack,
  options: TranscribeOptions,
  model: string | undefined,
  ctx: ToolContext,
): Promise<TranscribeToolOutput> {
  return tool.execute(
    {
      audio_path: track.path,
      ...(options.language === undefined ? {} : { language: options.language }),
      ...(model === undefined ? {} : { model }),
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

async function recordProviderSelection(
  selection: TranscriptionSelection,
  options: TranscribeOptions,
  logger: ToolLogger,
): Promise<void> {
  if (selection.why === "default" && (selection.preferred?.length ?? 0) === 0) {
    return;
  }

  const decision = buildProviderDecision(selection, options);
  logger.event("provider_selection", {
    picked: decision.picked,
    reason: decision.reason,
    preferred: selection.preferred?.[0],
    pinned: selection.pin,
  });
  await options.recordDecision?.(decision);
}

function buildProviderDecision(selection: TranscriptionSelection, options: TranscribeOptions): DecisionEntry {
  const timestamp = options.decisionTimestamp ?? new Date().toISOString();
  const tool = selection.tool;
  const picked = tool.name;
  const passedOver = selection.preferred?.[0] ?? (isLocalWhisper(tool) ? "elevenlabs-scribe" : "whisper-cpp");
  const reason = providerReason(selection);

  return {
    id: `transcription_provider-${safeTimestamp(timestamp)}`,
    stage: options.decisionStage ?? "cuesheet",
    timestamp,
    category: "provider_selection",
    scope: {
      capability: "transcribe",
      provider: tool.provider,
    },
    options_considered: [
      {
        label: picked,
        rejected_because: null,
        notes: reason,
      },
      {
        label: passedOver,
        rejected_because:
          selection.why === "default"
            ? `preferred ${passedOver} was unavailable or not selected by the registry`
            : selection.why === "fallback"
              ? `local whisper-cpp unavailable: ${selection.whisperUnavailable ?? "not available"}`
              : `${picked} was ${selection.why}`,
      },
    ],
    picked,
    reason,
    confidence: selection.why === "default" || selection.why === "fallback" ? 0.75 : 0.9,
    user_visible: true,
    supersedes: null,
  };
}

function providerReason(selection: TranscriptionSelection): string {
  const name = selection.tool.name;

  switch (selection.why) {
    case "pinned":
      return `${name} selected because ${TRANSCRIPTION_PROVIDER_ENV}=${selection.pin}.`;
    case "preferred":
      return `${name} selected because the caller preferred it (${selection.preferred?.join(", ")}).`;
    case "fallback":
      return `${name} selected because local whisper-cpp is unavailable.`;
    case "default":
      return `Fell back to ${name} because preferred ${selection.preferred?.join(", ") ?? "provider"} was unavailable or not selected.`;
  }
}

function confidenceFromRetryRatio(ratio: number): number {
  return Math.round(Math.max(0.5, Math.min(0.95, 1 - ratio / 2)) * 1000) / 1000;
}

function safeTimestamp(timestamp: string): string {
  return timestamp.replace(/[^a-z0-9]+/giu, "-").replace(/^-|-$/gu, "");
}
