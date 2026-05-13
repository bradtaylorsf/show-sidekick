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
