import type { Registry, ToolLogger } from "../registry/index.js";
import { CuesheetSchema, type Cuesheet } from "../artifacts/cuesheet.js";
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
}

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
    ? await transcribe(track, { ...common, ...transcriptOptions })
    : { segments: options.existing?.segments ?? [] };

  const sectionOptions = enabledOptions(options.detect_sections, true);
  const sections = sectionOptions
    ? await detectSections(track, {
        ...sectionOptions,
        transcript_hint: sectionOptions.transcript_hint ?? transcription.segments,
      })
    : options.existing?.sections ?? [];

  const beatOptions = enabledOptions(options.detect_beats, true);
  const beatDetection = beatOptions ? await detectBeats(track, { ...common, ...beatOptions }) : undefined;

  const preservedClimax = preserveNonAlgorithmicClimax(options.existing?.climax ?? []);
  const climaxOptions = enabledOptions(options.detect_climax, true);
  const climax = climaxOptions
    ? await detectClimax(track, {
        ...climaxOptions,
        sections,
        manual: preservedClimax,
      })
    : options.existing?.climax ?? preservedClimax;

  return CuesheetSchema.parse({
    audio: track,
    master_clock: options.master_clock ?? options.existing?.master_clock ?? "audio",
    bpm: beatDetection?.bpm ?? options.existing?.bpm,
    segments: transcription.segments,
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
