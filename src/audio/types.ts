export interface AudioTrack {
  path: string;
  duration_s: number;
  sample_rate: number;
  channels: number;
}

export interface EnergyWindow {
  start_s: number;
  end_s: number;
  rms: number;
  lufs: number;
}

export interface SectionBoundary {
  time_s: number;
  lufs_drop: number;
}

export interface InstrumentalDip {
  start_s: number;
  end_s: number;
}

export interface Word {
  text: string;
  start_s: number;
  end_s: number;
  confidence: number;
}

export interface Segment {
  start_s: number;
  end_s: number;
  text: string;
  words: Word[];
}

export interface Section {
  label: string;
  start_s: number;
  end_s: number;
  kind: "vocal" | "instrumental" | "silence";
  energy: number;
}

export interface Beat {
  time_s: number;
  strength: number;
  is_downbeat: boolean;
}

export interface ClimaxPoint {
  time_s: number;
  type: "peak" | "drop" | "arrival" | "release";
  intensity: number;
  source: "algorithm" | "agent" | "manual";
}

export interface SceneAnchor {
  scene_id: string;
  start_s: number;
  end_s: number;
  snapped_to: "section_start" | "beat" | "downbeat" | "word" | "climax" | "manual";
  source: { section?: string; beat_index?: number; word_id?: string; climax_index?: number };
}
