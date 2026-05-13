import { execFile } from "node:child_process";
import { findSectionBoundaries, probeEnergy } from "./energy.js";
import type { AudioTrack, EnergyWindow, Section, Segment, Word } from "./types.js";

export interface DetectSectionsOptions {
  min_section_s?: number;
  silence_threshold_db?: number;
  silence_min_duration_s?: number;
  transcript_hint?: Segment[];
  windows?: EnergyWindow[];
  window_s?: number;
  timeoutMs?: number;
}

type SilenceRegion = {
  start_s: number;
  end_s: number;
};

type Region = {
  start_s: number;
  end_s: number;
};

const DEFAULT_MIN_SECTION_S = 8;
const DEFAULT_SILENCE_THRESHOLD_DB = -40;
const DEFAULT_SILENCE_MIN_DURATION_S = 0.5;
const DEFAULT_WINDOW_S = 0.5;
const DEFAULT_TIMEOUT_MS = 30_000;
const FFMPEG_MAX_BUFFER = 8 * 1024 * 1024;
const BOUNDARY_DEDUPE_S = 0.2;
const ENERGY_CHANGE_LUFS = 5;

export async function detectSections(track: AudioTrack, options: DetectSectionsOptions = {}): Promise<Section[]> {
  const normalized = normalizeOptions(options);
  const [silenceRegions, windows] = await Promise.all([
    runSilenceDetect(track.path, {
      duration_s: track.duration_s,
      noise_db: normalized.silence_threshold_db,
      min_duration_s: normalized.silence_min_duration_s,
      timeoutMs: normalized.timeoutMs,
    }),
    normalized.windows ?? probeEnergy(track, { window_s: normalized.window_s, timeoutMs: normalized.timeoutMs }),
  ]);

  return detectSectionsFromWindows(track, windows, {
    ...normalized,
    silence_regions: silenceRegions,
  });
}

export function detectSectionsFromWindows(
  track: AudioTrack,
  windows: EnergyWindow[],
  options: DetectSectionsOptions & { silence_regions?: SilenceRegion[] } = {},
): Section[] {
  const normalized = normalizeOptions(options);
  const silenceRegions = options.silence_regions ?? [];
  const boundaries = collectBoundaries(track, windows, silenceRegions, normalized.transcript_hint);
  const regions = enforceMinimumSectionLength(
    boundariesToRegions(track.duration_s, boundaries),
    windows,
    normalized.min_section_s,
    track.duration_s,
  );
  const maxRms = Math.max(...windows.map((window) => window.rms), 0);
  let silenceIndex = 1;

  return regions.map((region, index) => {
    const kind = classifyRegion(region, silenceRegions, normalized.transcript_hint);
    const label = kind === "silence" ? `silence-${silenceIndex++}` : `section-${index + 1}`;

    return {
      label,
      start_s: roundSeconds(region.start_s),
      end_s: roundSeconds(region.end_s),
      kind,
      energy: normalizeEnergy(meanRms(windows, region), maxRms),
    };
  });
}

function normalizeOptions(options: DetectSectionsOptions): Required<Omit<DetectSectionsOptions, "transcript_hint" | "windows">> & {
  transcript_hint?: Segment[];
  windows?: EnergyWindow[];
} {
  const normalized = {
    min_section_s: options.min_section_s ?? DEFAULT_MIN_SECTION_S,
    silence_threshold_db: options.silence_threshold_db ?? DEFAULT_SILENCE_THRESHOLD_DB,
    silence_min_duration_s: options.silence_min_duration_s ?? DEFAULT_SILENCE_MIN_DURATION_S,
    transcript_hint: options.transcript_hint,
    windows: options.windows,
    window_s: options.window_s ?? DEFAULT_WINDOW_S,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  requirePositive(normalized.min_section_s, "min_section_s");
  requirePositive(normalized.silence_min_duration_s, "silence_min_duration_s");
  requirePositive(normalized.window_s, "window_s");
  requirePositive(normalized.timeoutMs, "timeoutMs");

  if (!Number.isFinite(normalized.silence_threshold_db)) {
    throw new Error("silence_threshold_db must be a finite number");
  }

  return normalized;
}

function collectBoundaries(
  track: AudioTrack,
  windows: EnergyWindow[],
  silenceRegions: SilenceRegion[],
  transcriptHint: Segment[] | undefined,
): number[] {
  const candidates = [
    ...silenceRegions.flatMap((region) => [region.start_s, region.end_s]),
    ...findSectionBoundaries(windows).map((boundary) => boundary.time_s),
    ...findEnergyChangeBoundaries(windows),
    ...findTranscriptPresenceBoundaries(windows, transcriptHint),
  ];
  const windowEdges = windows.flatMap((window) => [window.start_s, window.end_s]);
  const snapped = candidates
    .filter((time) => Number.isFinite(time) && time > 0 && time < track.duration_s)
    .map((time) => snapToNearestEdge(time, windowEdges))
    .sort((left, right) => left - right);

  const deduped: number[] = [];
  for (const time of snapped) {
    const previous = deduped.at(-1);
    if (previous === undefined || Math.abs(time - previous) > BOUNDARY_DEDUPE_S) {
      deduped.push(time);
    }
  }

  return deduped;
}

function findEnergyChangeBoundaries(windows: EnergyWindow[]): number[] {
  const boundaries: number[] = [];

  for (let index = 1; index < windows.length; index += 1) {
    const previous = windows[index - 1] as EnergyWindow;
    const current = windows[index] as EnergyWindow;

    if (Math.abs(previous.lufs - current.lufs) >= ENERGY_CHANGE_LUFS) {
      boundaries.push(current.start_s);
    }
  }

  return boundaries;
}

function findTranscriptPresenceBoundaries(windows: EnergyWindow[], transcriptHint: Segment[] | undefined): number[] {
  if (!transcriptHint || transcriptHint.length === 0 || windows.length === 0) {
    return [];
  }

  const boundaries: number[] = [];
  let previous = hasTranscriptInRange(windows[0] as EnergyWindow, transcriptHint);

  for (let index = 1; index < windows.length; index += 1) {
    const window = windows[index] as EnergyWindow;
    const current = hasTranscriptInRange(window, transcriptHint);

    if (current !== previous) {
      boundaries.push(window.start_s);
    }

    previous = current;
  }

  return boundaries;
}

function boundariesToRegions(duration_s: number, boundaries: number[]): Region[] {
  const points = [0, ...boundaries, duration_s];
  const regions: Region[] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const start_s = points[index] as number;
    const end_s = points[index + 1] as number;

    if (end_s - start_s > 0.001) {
      regions.push({ start_s, end_s });
    }
  }

  return regions.length === 0 ? [{ start_s: 0, end_s: duration_s }] : regions;
}

function enforceMinimumSectionLength(
  inputRegions: Region[],
  windows: EnergyWindow[],
  minSectionS: number,
  durationS: number,
): Region[] {
  if (durationS <= minSectionS) {
    return [{ start_s: 0, end_s: durationS }];
  }

  const regions = [...inputRegions];

  while (regions.length > 1) {
    const shortIndex = regions.findIndex((region) => duration(region) < minSectionS);
    if (shortIndex === -1) {
      return regions;
    }

    const targetIndex = chooseMergeTarget(regions, windows, shortIndex);
    const left = Math.min(shortIndex, targetIndex);
    const right = Math.max(shortIndex, targetIndex);
    regions.splice(left, right - left + 1, {
      start_s: regions[left]?.start_s ?? 0,
      end_s: regions[right]?.end_s ?? durationS,
    });
  }

  return regions;
}

function chooseMergeTarget(regions: Region[], windows: EnergyWindow[], shortIndex: number): number {
  if (shortIndex === 0) {
    return 1;
  }

  if (shortIndex === regions.length - 1) {
    return shortIndex - 1;
  }

  const currentEnergy = meanRms(windows, regions[shortIndex] as Region);
  const previousDelta = Math.abs(currentEnergy - meanRms(windows, regions[shortIndex - 1] as Region));
  const nextDelta = Math.abs(currentEnergy - meanRms(windows, regions[shortIndex + 1] as Region));

  return previousDelta <= nextDelta ? shortIndex - 1 : shortIndex + 1;
}

function classifyRegion(region: Region, silenceRegions: SilenceRegion[], transcriptHint: Segment[] | undefined): Section["kind"] {
  const regionDuration = duration(region);
  const silenceOverlap = silenceRegions.reduce((sum, silence) => sum + overlapDuration(region, silence), 0);

  if (regionDuration > 0 && silenceOverlap / regionDuration > 0.5) {
    return "silence";
  }

  if (transcriptHint?.some((segment) => segmentOverlapsRegion(segment, region)) === true) {
    return "vocal";
  }

  return "instrumental";
}

function hasTranscriptInRange(window: EnergyWindow, transcriptHint: Segment[]): boolean {
  return transcriptHint.some((segment) => segmentOverlapsRegion(segment, window));
}

function segmentOverlapsRegion(segment: Segment, region: Region): boolean {
  const words = segment.words;

  if (words.length === 0) {
    return rangesOverlap(region.start_s, region.end_s, segment.start_s, segment.end_s);
  }

  return words.some((word) => wordOverlapsRegion(word, region));
}

function wordOverlapsRegion(word: Word, region: Region): boolean {
  return rangesOverlap(region.start_s, region.end_s, word.start_s, word.end_s);
}

function snapToNearestEdge(time: number, edges: number[]): number {
  if (edges.length === 0) {
    return time;
  }

  let closest = edges[0] as number;
  let closestDistance = Math.abs(time - closest);

  for (const edge of edges.slice(1)) {
    const distance = Math.abs(time - edge);
    if (distance < closestDistance) {
      closest = edge;
      closestDistance = distance;
    }
  }

  return closestDistance <= BOUNDARY_DEDUPE_S ? closest : time;
}

function meanRms(windows: EnergyWindow[], region: Region): number {
  const overlapping = windows.filter((window) => rangesOverlap(region.start_s, region.end_s, window.start_s, window.end_s));
  if (overlapping.length === 0) {
    return 0;
  }

  return overlapping.reduce((sum, window) => sum + window.rms, 0) / overlapping.length;
}

function normalizeEnergy(rms: number, maxRms: number): number {
  if (maxRms <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(1, rms / maxRms));
}

function overlapDuration(left: Region, right: Region): number {
  return Math.max(0, Math.min(left.end_s, right.end_s) - Math.max(left.start_s, right.start_s));
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function duration(region: Region): number {
  return region.end_s - region.start_s;
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function requirePositive(value: number, field: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${field} must be a positive number`);
  }
}

function runSilenceDetect(
  path: string,
  options: { duration_s: number; noise_db: number; min_duration_s: number; timeoutMs: number },
): Promise<SilenceRegion[]> {
  const args = [
    "-hide_banner",
    "-nostats",
    "-i",
    path,
    "-af",
    `silencedetect=noise=${options.noise_db}dB:d=${options.min_duration_s}`,
    "-f",
    "null",
    "-",
  ];

  return new Promise((resolve, reject) => {
    execFile("ffmpeg", args, { encoding: "utf8", maxBuffer: FFMPEG_MAX_BUFFER, timeout: options.timeoutMs }, (error, _stdout, stderr) => {
      if (error) {
        reject(new Error(`ffmpeg silencedetect failed for ${path}: ${error.message}${stderr ? `\n${stderr}` : ""}`));
        return;
      }

      resolve(parseSilenceDetect(stderr, options.duration_s));
    });
  });
}

function parseSilenceDetect(stderr: string, duration_s: number): SilenceRegion[] {
  const regions: SilenceRegion[] = [];
  let currentStart: number | undefined;

  for (const line of stderr.split(/\r?\n/u)) {
    const startMatch = /silence_start:\s*([0-9.]+)/u.exec(line);
    if (startMatch) {
      currentStart = Number(startMatch[1]);
      continue;
    }

    const endMatch = /silence_end:\s*([0-9.]+)/u.exec(line);
    if (endMatch && currentStart !== undefined) {
      const end_s = Number(endMatch[1]);
      if (Number.isFinite(currentStart) && Number.isFinite(end_s) && end_s > currentStart) {
        regions.push({ start_s: currentStart, end_s });
      }
      currentStart = undefined;
    }
  }

  if (currentStart !== undefined && duration_s > currentStart) {
    regions.push({ start_s: currentStart, end_s: duration_s });
  }

  return regions;
}
