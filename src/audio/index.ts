export * from "./ffprobe.js";
export { load } from "./load.js";
export { findInstrumentalDips, findSectionBoundaries, probeEnergy } from "./energy.js";
export { detectSections, detectSectionsFromWindows } from "./sections.js";
export { detectBeats } from "./beats.js";
export { detectClimax, detectClimaxFromWindows } from "./climax.js";
export { alignScenes } from "./align.js";
export { alignLyrics, canonicalLyricsFromEpisodeInputs } from "./lyrics-align.js";
export { buildCuesheet } from "./cuesheet.js";
export { transcribe } from "./transcribe.js";
export type {
  AudioTrack,
  Beat,
  ClimaxPoint,
  EnergyWindow,
  InstrumentalDip,
  Section,
  Segment,
  SectionBoundary,
  SceneAnchor,
  Word,
} from "./types.js";
export type { AlignScenesOptions, SnapTarget } from "./align.js";
export type { AlignLyricsOptions } from "./lyrics-align.js";
export type { BeatDetection, DetectBeatsOptions } from "./beats.js";
export type { BuildCuesheetOptions } from "./cuesheet.js";
export type { DetectClimaxOptions } from "./climax.js";
export type { DetectSectionsOptions } from "./sections.js";
export type { TranscribeOptions, Transcription } from "./transcribe.js";
