export { FfprobeError, ffprobe } from "./ffprobe.js";
export { load } from "./load.js";
export { findInstrumentalDips, findSectionBoundaries, probeEnergy } from "./energy.js";
export { detectSections, detectSectionsFromWindows } from "./sections.js";
export { transcribe } from "./transcribe.js";
export type {
  AudioTrack,
  EnergyWindow,
  InstrumentalDip,
  Section,
  Segment,
  SectionBoundary,
  Word,
} from "./types.js";
export type { DetectSectionsOptions } from "./sections.js";
export type { TranscribeOptions, Transcription } from "./transcribe.js";
