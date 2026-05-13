import { probeEnergy } from "./energy.js";
import type { AudioTrack, ClimaxPoint, EnergyWindow, Section } from "./types.js";

export interface DetectClimaxOptions {
  sections: Section[];
  windows?: EnergyWindow[];
  manual?: ClimaxPoint[];
  window_s?: number;
  timeoutMs?: number;
}

type Candidate = {
  index: number;
  time_s: number;
  rms: number;
  weight: number;
};

type Curve = {
  center: number;
  before: number;
  after: number;
  afterNear: number;
};

const DEFAULT_WINDOW_S = 0.5;
const MIN_PEAK_SEPARATION_S = 3;
const CURVE_SHAPE_S = 4;
const MIN_DYNAMIC_RANGE = 0.03;
const MIN_RELATIVE_DYNAMIC_RANGE = 0.18;
const MIN_WEIGHT = 0.08;
const PEAK_RELATIVE_THRESHOLD = 0.7;

export async function detectClimax(track: AudioTrack, options: DetectClimaxOptions): Promise<ClimaxPoint[]> {
  const manual = options.manual ?? [];
  const windows = options.windows ?? (await probeEnergy(track, { window_s: options.window_s ?? DEFAULT_WINDOW_S, timeoutMs: options.timeoutMs }));
  const algorithmic = detectClimaxFromWindows(track, windows, options.sections);

  return [...algorithmic, ...manual].sort((left, right) => left.time_s - right.time_s);
}

export function detectClimaxFromWindows(
  track: AudioTrack,
  windows: EnergyWindow[],
  sections: Section[],
): ClimaxPoint[] {
  if (windows.length === 0 || sections.length === 0) {
    return [];
  }

  const smoothed = smoothRms(windows);
  if (!hasMeaningfulDynamicRange(smoothed)) {
    return [];
  }

  const candidates = localMaxima(track, windows, smoothed, sections);
  if (candidates.length === 0) {
    return [];
  }

  const maxWeight = Math.max(...candidates.map((candidate) => candidate.weight));
  const threshold = Math.max(MIN_WEIGHT, maxWeight * PEAK_RELATIVE_THRESHOLD);
  const accepted = selectSeparatedPeaks(
    candidates.filter((candidate) => candidate.weight >= threshold),
    MIN_PEAK_SEPARATION_S,
  );

  return accepted
    .sort((left, right) => left.time_s - right.time_s)
    .map((candidate) => {
      const curve = surroundingCurve(candidate.index, windows, smoothed);

      return {
        time_s: roundSeconds(candidate.time_s),
        type: classifyCurve(curve),
        intensity: normalizeIntensity(candidate.weight, maxWeight),
        source: "algorithm",
      };
    });
}

function smoothRms(windows: EnergyWindow[]): number[] {
  return windows.map((_window, index) => {
    const start = Math.max(0, index - 1);
    const end = Math.min(windows.length, index + 2);
    const slice = windows.slice(start, end);

    return slice.reduce((sum, window) => sum + window.rms, 0) / slice.length;
  });
}

function hasMeaningfulDynamicRange(values: number[]): boolean {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min;

  return max > 0 && range >= MIN_DYNAMIC_RANGE && range / max >= MIN_RELATIVE_DYNAMIC_RANGE;
}

function localMaxima(track: AudioTrack, windows: EnergyWindow[], smoothed: number[], sections: Section[]): Candidate[] {
  const maxSectionDuration = Math.max(...sections.map((section) => section.end_s - section.start_s), 0);
  const candidates: Candidate[] = [];
  let index = 0;

  while (index < smoothed.length) {
    const left = smoothed[index - 1] ?? Number.NEGATIVE_INFINITY;
    const current = smoothed[index] as number;
    const right = smoothed[index + 1] ?? Number.NEGATIVE_INFINITY;

    if (current < left || current < right) {
      index += 1;
      continue;
    }

    const plateauStart = index;
    let plateauEnd = index;

    while (plateauEnd + 1 < smoothed.length && smoothed[plateauEnd + 1] === current) {
      plateauEnd += 1;
    }

    const before = smoothed[plateauStart - 1] ?? Number.NEGATIVE_INFINITY;
    const after = smoothed[plateauEnd + 1] ?? Number.NEGATIVE_INFINITY;

    if (current >= before && current >= after && (current > before || current > after)) {
      const midpoint = Math.floor((plateauStart + plateauEnd) / 2);
      const window = windows[midpoint] as EnergyWindow;
      const time_s = Math.min(track.duration_s, (window.start_s + window.end_s) / 2);
      const section = sectionAt(sections, time_s);

      if (section && section.kind !== "silence") {
        const lengthFactor = maxSectionDuration <= 0 ? 1 : (section.end_s - section.start_s) / maxSectionDuration;
        candidates.push({
          index: midpoint,
          time_s,
          rms: current,
          weight: current * lengthFactor,
        });
      }
    }

    index = plateauEnd + 1;
  }

  return candidates;
}

function selectSeparatedPeaks(candidates: Candidate[], minSeparationS: number): Candidate[] {
  const accepted: Candidate[] = [];
  const ranked = [...candidates].sort((left, right) => right.weight - left.weight || left.time_s - right.time_s);

  for (const candidate of ranked) {
    if (accepted.every((peak) => Math.abs(peak.time_s - candidate.time_s) >= minSeparationS)) {
      accepted.push(candidate);
    }
  }

  return accepted;
}

function surroundingCurve(index: number, windows: EnergyWindow[], smoothed: number[]): Curve {
  const center = smoothed[index] as number;
  const centerTime = midpoint(windows[index] as EnergyWindow);
  const before = averageNearby(windows, smoothed, centerTime - CURVE_SHAPE_S, centerTime, center);
  const after = averageNearby(windows, smoothed, centerTime, centerTime + CURVE_SHAPE_S, center);
  const afterNear = averageNearby(windows, smoothed, centerTime, centerTime + CURVE_SHAPE_S / 2, center);

  return { center, before, after, afterNear };
}

function classifyCurve(curve: Curve): ClimaxPoint["type"] {
  const rise = curve.center - curve.before;
  const nearDrop = curve.center - curve.afterNear;
  const sustainedDrop = curve.center - curve.after;
  const strongRise = rise >= curve.center * 0.15;
  const sharpDrop = nearDrop >= curve.center * 0.22;
  const releaseDrop = sustainedDrop >= curve.center * 0.15;

  if (strongRise && sharpDrop) {
    return "peak";
  }

  if (sharpDrop) {
    return "drop";
  }

  if (strongRise && !releaseDrop) {
    return "arrival";
  }

  if (releaseDrop) {
    return "release";
  }

  return "peak";
}

function averageNearby(
  windows: EnergyWindow[],
  values: number[],
  start_s: number,
  end_s: number,
  fallback: number,
): number {
  const matches = values.filter((_value, index) => {
    const time = midpoint(windows[index] as EnergyWindow);
    return time >= start_s && time < end_s;
  });

  if (matches.length === 0) {
    return fallback;
  }

  return matches.reduce((sum, value) => sum + value, 0) / matches.length;
}

function sectionAt(sections: Section[], time_s: number): Section | undefined {
  return sections.find((section) => time_s >= section.start_s && time_s < section.end_s) ?? sections.at(-1);
}

function midpoint(window: EnergyWindow): number {
  return (window.start_s + window.end_s) / 2;
}

function normalizeIntensity(weight: number, maxWeight: number): number {
  if (maxWeight <= 0) {
    return 0;
  }

  return Math.round(Math.max(0, Math.min(1, weight / maxWeight)) * 1000) / 1000;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}
