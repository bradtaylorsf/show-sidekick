import { spawn } from "node:child_process";
import type { AudioTrack, EnergyWindow, InstrumentalDip, SectionBoundary, Word } from "./types.js";

const DEFAULT_WINDOW_S = 0.5;
const DEFAULT_FFMPEG_TIMEOUT_MS = 30_000;
const SILENCE_LUFS = -120;

export async function probeEnergy(
  track: AudioTrack,
  options: { window_s?: number; timeoutMs?: number } = {},
): Promise<EnergyWindow[]> {
  const window_s = options.window_s ?? DEFAULT_WINDOW_S;

  if (!Number.isFinite(window_s) || window_s <= 0) {
    throw new Error("window_s must be a positive number");
  }

  const accumulator = createPcmEnergyAccumulator(track, { window_s });

  await streamPcm(track, { timeoutMs: options.timeoutMs ?? DEFAULT_FFMPEG_TIMEOUT_MS }, (chunk) => {
    accumulator.push(chunk);
  });

  return accumulator.finish();
}

export function findSectionBoundaries(
  windows: EnergyWindow[],
  options: { section_boundary_lufs_threshold?: number } = {},
): SectionBoundary[] {
  const threshold = options.section_boundary_lufs_threshold ?? 5.0;
  const boundaries: SectionBoundary[] = [];

  for (let index = 1; index < windows.length; index += 1) {
    const previous = windows[index - 1] as EnergyWindow;
    const current = windows[index] as EnergyWindow;
    const lufs_drop = previous.lufs - current.lufs;

    if (lufs_drop >= threshold) {
      boundaries.push({ time_s: current.start_s, lufs_drop });
    }
  }

  return boundaries;
}

export function findInstrumentalDips(
  windows: EnergyWindow[],
  words: Word[],
  options: { min_duration_s?: number; music_lufs_floor?: number } = {},
): InstrumentalDip[] {
  const minDuration = options.min_duration_s ?? 0.3;
  const musicLufsFloor = options.music_lufs_floor ?? -30;
  const dips: InstrumentalDip[] = [];
  let currentStart: number | undefined;
  let currentEnd: number | undefined;

  for (const window of windows) {
    const isMusicDominant = window.lufs >= musicLufsFloor;
    const hasWords = words.some((word) => rangesOverlap(window.start_s, window.end_s, word.start_s, word.end_s));

    if (isMusicDominant && !hasWords) {
      if (currentStart === undefined || currentEnd === undefined || window.start_s - currentEnd > 0.001) {
        flushDip(dips, currentStart, currentEnd, minDuration);
        currentStart = window.start_s;
      }
      currentEnd = window.end_s;
      continue;
    }

    flushDip(dips, currentStart, currentEnd, minDuration);
    currentStart = undefined;
    currentEnd = undefined;
  }

  flushDip(dips, currentStart, currentEnd, minDuration);
  return dips;
}

export function createPcmEnergyAccumulator(
  track: AudioTrack,
  options: { window_s?: number } = {},
): { push(chunk: Buffer): void; finish(): EnergyWindow[] } {
  const window_s = options.window_s ?? DEFAULT_WINDOW_S;
  const sampleRate = requirePositiveInteger(track.sample_rate, "track.sample_rate");
  const channels = requirePositiveInteger(track.channels, "track.channels");
  const windowFrames = Math.max(1, Math.round(window_s * sampleRate));
  const totalFrames = Math.max(1, Math.ceil(track.duration_s * sampleRate));
  const windowCount = Math.max(1, Math.ceil(totalFrames / windowFrames));
  const sums = Array.from({ length: windowCount }, () => ({ sumSquares: 0, sampleCount: 0 }));
  let sampleIndex = 0;
  let carry = Buffer.alloc(0);

  return {
    push(chunk: Buffer) {
      const data = carry.length === 0 ? chunk : Buffer.concat([carry, chunk]);
      const usableLength = data.length - (data.length % 2);

      for (let offset = 0; offset < usableLength; offset += 2) {
        const frameIndex = Math.floor(sampleIndex / channels);
        sampleIndex += 1;

        if (frameIndex >= totalFrames) {
          continue;
        }

        const windowIndex = Math.min(Math.floor(frameIndex / windowFrames), windowCount - 1);
        const sample = data.readInt16LE(offset) / 32768;
        const bucket = sums[windowIndex] as { sumSquares: number; sampleCount: number };

        bucket.sumSquares += sample * sample;
        bucket.sampleCount += 1;
      }

      carry = usableLength === data.length ? Buffer.alloc(0) : Buffer.from(data.subarray(usableLength));
    },
    finish() {
      return sums.map((bucket, index) => {
        const startFrame = index * windowFrames;
        const endFrame = Math.min(startFrame + windowFrames, totalFrames);
        const start_s = startFrame / sampleRate;
        const end_s = Math.min(track.duration_s, endFrame / sampleRate);
        const rms = bucket.sampleCount === 0 ? 0 : Math.sqrt(bucket.sumSquares / bucket.sampleCount);

        return {
          start_s,
          end_s,
          rms,
          lufs: rmsToLufs(rms),
        };
      });
    },
  };
}

function streamPcm(track: AudioTrack, options: { timeoutMs: number }, onChunk: (chunk: Buffer) => void): Promise<void> {
  const args = [
    "-hide_banner",
    "-nostats",
    "-v",
    "error",
    "-i",
    track.path,
    "-acodec",
    "pcm_s16le",
    "-f",
    "s16le",
    "-ac",
    String(track.channels),
    "-ar",
    String(track.sample_rate),
    "pipe:1",
  ];

  return new Promise((resolve, reject) => {
    const child = spawn(
      "ffmpeg",
      args,
      {
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    let stderr = "";
    let processingError: unknown;
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      try {
        onChunk(chunk);
      } catch (error) {
        processingError = error;
        child.kill("SIGKILL");
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      if (stderr.length < 16_384) {
        stderr += chunk.toString("utf8");
      }
    });
    child.once("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timeout);

      if (processingError !== undefined) {
        reject(processingError);
        return;
      }

      if (timedOut) {
        reject(new Error(`ffmpeg audio decode timed out after ${options.timeoutMs}ms for ${track.path}`));
        return;
      }

      if (code !== 0) {
        reject(new Error(`ffmpeg audio decode failed for ${track.path}: exited with code ${code}${stderr ? `\n${stderr}` : ""}`));
        return;
      }

      resolve();
    });
  });
}

function rmsToLufs(rms: number): number {
  return rms > 0 ? 20 * Math.log10(rms) : SILENCE_LUFS;
}

function flushDip(
  dips: InstrumentalDip[],
  currentStart: number | undefined,
  currentEnd: number | undefined,
  minDuration: number,
): void {
  if (currentStart === undefined || currentEnd === undefined) {
    return;
  }

  if (currentEnd - currentStart >= minDuration) {
    dips.push({ start_s: currentStart, end_s: currentEnd });
  }
}

function rangesOverlap(leftStart: number, leftEnd: number, rightStart: number, rightEnd: number): boolean {
  return leftStart < rightEnd && rightStart < leftEnd;
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }

  return value;
}
