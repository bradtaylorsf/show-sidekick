import type { DecisionEntry } from "../artifacts/decision-log.js";
import { AudioEnergySchema, type AudioEnergy } from "../artifacts/audio-energy.js";
import type { Registry, Tool, ToolContext, ToolLogger } from "../registry/index.js";
import { CuesheetSchema, type Cuesheet } from "../artifacts/cuesheet.js";
import * as defaultLogger from "../log/logger.js";
import { probeEnergy } from "./energy.js";
import { load } from "./load.js";
import { transcribe, type TranscribeOptions } from "./transcribe.js";
import { detectSections, type DetectSectionsOptions } from "./sections.js";
import { detectBeats, type DetectBeatsOptions } from "./beats.js";
import { detectClimax, type DetectClimaxOptions } from "./climax.js";
import type { AudioTrack, ClimaxPoint } from "./types.js";

export interface BuildCuesheetOptions {
  master_clock?: "audio" | "voiceover";
  transcribe?: boolean | TranscribeOptions;
  detect_sections?: boolean | DetectSectionsOptions;
  detect_beats?: boolean | DetectBeatsOptions;
  detect_climax?: boolean | Omit<DetectClimaxOptions, "sections" | "manual">;
  existing?: Cuesheet;
  registry?: Registry;
  logger?: ToolLogger;
  projectRoot?: string;
  recordDecision?: (entry: DecisionEntry) => Promise<void> | void;
  recordAudioEnergy?: (audioEnergy: AudioEnergy) => Promise<void> | void;
  decisionTimestamp?: string;
}

type AudioEnergyToolInput = {
  path: string;
  window_s?: number;
};

export async function buildCuesheet(
  trackOrPath: string | AudioTrack,
  options: BuildCuesheetOptions = {},
): Promise<Cuesheet> {
  const track = typeof trackOrPath === "string" ? await load(trackOrPath) : trackOrPath;
  const common = {
    registry: options.registry,
    logger: options.logger,
    projectRoot: options.projectRoot,
  };

  const transcriptOptions = enabledOptions(options.transcribe, true);
  const transcription = transcriptOptions
    ? await transcribe(track, {
        ...common,
        recordDecision: options.recordDecision,
        decisionTimestamp: options.decisionTimestamp,
        decisionStage: "cuesheet",
        ...transcriptOptions,
      })
    : undefined;

  const sectionOptions = enabledOptions(options.detect_sections, true);
  const climaxOptions = enabledOptions(options.detect_climax, true);
  const providedWindows = sectionOptions?.windows ?? climaxOptions?.windows;
  const energyWindowS = sectionOptions?.window_s ?? climaxOptions?.window_s;
  const sharedWindows =
    sectionOptions || climaxOptions
      ? providedWindows ??
        (await resolveSharedEnergyWindows(track, {
          registry: options.registry,
          logger: options.logger,
          projectRoot: options.projectRoot,
          window_s: energyWindowS,
          timeoutMs: sectionOptions?.timeoutMs ?? climaxOptions?.timeoutMs,
          recordAudioEnergy: options.recordAudioEnergy,
        }))
      : undefined;
  const segments = transcription?.segments ?? options.existing?.segments ?? [];
  const sections = sectionOptions
    ? await detectSections(track, {
        ...sectionOptions,
        transcript_hint: sectionOptions.transcript_hint ?? segments,
        windows: sharedWindows,
      })
    : options.existing?.sections ?? [];

  const beatOptions = enabledOptions(options.detect_beats, true);
  const beatDetection = beatOptions ? await detectBeats(track, { ...common, ...beatOptions }) : undefined;

  const preservedClimax = preserveNonAlgorithmicClimax(options.existing?.climax ?? []);
  const climax = climaxOptions
    ? await detectClimax(track, {
        ...climaxOptions,
        sections,
        manual: preservedClimax,
        windows: sharedWindows,
      })
    : options.existing?.climax ?? preservedClimax;
  const transcriptionConfidence =
    transcription === undefined
      ? options.existing?.transcription_confidence
      : {
          average: transcription.average_confidence,
          low_confidence: transcription.low_confidence,
        };

  return CuesheetSchema.parse({
    audio: track,
    master_clock: options.master_clock ?? options.existing?.master_clock ?? "audio",
    bpm: beatDetection?.bpm ?? options.existing?.bpm,
    ...(transcriptionConfidence === undefined ? {} : { transcription_confidence: transcriptionConfidence }),
    segments,
    sections,
    beats: beatDetection?.beats ?? options.existing?.beats ?? [],
    climax,
    scene_anchors: options.existing?.scene_anchors ?? [],
  });
}

function enabledOptions<T extends object>(
  value: boolean | T | undefined,
  defaultEnabled: boolean,
): T | undefined {
  if (value === undefined) {
    return defaultEnabled ? ({} as T) : undefined;
  }

  if (value === false) {
    return undefined;
  }

  if (value === true) {
    return {} as T;
  }

  return value;
}

function preserveNonAlgorithmicClimax(climax: ClimaxPoint[]): ClimaxPoint[] {
  return climax.filter((point) => point.source !== "algorithm");
}

async function resolveSharedEnergyWindows(
  track: AudioTrack,
  options: {
    registry?: Registry;
    logger?: ToolLogger;
    projectRoot?: string;
    window_s?: number;
    timeoutMs?: number;
    recordAudioEnergy?: (audioEnergy: AudioEnergy) => Promise<void> | void;
  },
): Promise<AudioEnergy["energy_profile"]> {
  const registryEnergy = await analyzeEnergyWithRegistry(track, options);
  if (registryEnergy !== undefined) {
    await options.recordAudioEnergy?.(registryEnergy);
    return registryEnergy.energy_profile;
  }

  const windows = await probeEnergy(track, { window_s: options.window_s, timeoutMs: options.timeoutMs });
  await options.recordAudioEnergy?.(audioEnergyFromWindows(windows));
  return windows;
}

async function analyzeEnergyWithRegistry(
  track: AudioTrack,
  options: {
    registry?: Registry;
    logger?: ToolLogger;
    projectRoot?: string;
    window_s?: number;
  },
): Promise<AudioEnergy | undefined> {
  if (options.registry === undefined) {
    return undefined;
  }

  try {
    const tool = (await options.registry.select("audio_energy", {
      context: { projectRoot: options.projectRoot ?? process.cwd() },
    })) as Tool<AudioEnergyToolInput, unknown>;
    const ctx: ToolContext = {
      projectRoot: options.projectRoot ?? process.cwd(),
      logger: options.logger ?? defaultLogger,
      registry: options.registry,
    };
    const result = await tool.execute(
      {
        path: track.path,
        ...(options.window_s === undefined ? {} : { window_s: options.window_s }),
      },
      ctx,
    );

    return AudioEnergySchema.parse(result);
  } catch (error) {
    options.logger?.warn("registry audio_energy analysis failed; falling back to PCM energy probing", {
      error: error instanceof Error ? error.message : String(error),
    });
    return undefined;
  }
}

function audioEnergyFromWindows(windows: AudioEnergy["energy_profile"]): AudioEnergy {
  const active = windows.filter((window) => window.lufs > -45);
  const peak = active.reduce<AudioEnergy["energy_profile"][number] | undefined>((best, window) => {
    if (best === undefined || window.lufs > best.lufs) {
      return window;
    }

    return best;
  }, undefined);

  return AudioEnergySchema.parse({
    source: "pcm-rms",
    raw_points: windows.map((window) => ({
      time_s: roundSeconds((window.start_s + window.end_s) / 2),
      momentary_lufs: window.lufs,
      ...(window.lufs <= -120 ? { is_silence: true } : {}),
    })),
    energy_profile: windows,
    first_active_s: active[0]?.start_s ?? null,
    peak_s: peak === undefined ? null : roundSeconds((peak.start_s + peak.end_s) / 2),
    recommended_offset_s: active[0]?.start_s ?? 0,
    best_window: bestWindowFromWindows(windows),
    silence_threshold_lufs: -45,
    analysis_window_s: Math.max(...windows.map((window) => window.end_s - window.start_s), 0) || undefined,
  });
}

function bestWindowFromWindows(windows: AudioEnergy["energy_profile"]): AudioEnergy["best_window"] {
  if (windows.length === 0) {
    return null;
  }

  const best = windows.reduce((winner, window) => (window.rms > winner.rms ? window : winner), windows[0] as AudioEnergy["energy_profile"][number]);

  return {
    start_s: best.start_s,
    end_s: best.end_s,
    average_lufs: best.lufs,
    peak_lufs: best.lufs,
  };
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
