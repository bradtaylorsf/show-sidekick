import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createPcmEnergyAccumulator, findInstrumentalDips, findSectionBoundaries, probeEnergy } from "./energy.js";
import { load } from "./load.js";
import type { Word } from "./types.js";

const hasAudioBins = hasBinary("ffmpeg") && hasBinary("ffprobe");

describe("probeEnergy", () => {
  it("computes window energy incrementally from chunked PCM without buffering the full track", () => {
    const accumulator = createPcmEnergyAccumulator(
      { path: "/tmp/long.wav", duration_s: 8 * 60, sample_rate: 10, channels: 1 },
      { window_s: 60 },
    );
    const oneMinute = pcmSamples(Array.from({ length: 600 }, () => 0.5));

    for (let index = 0; index < 8; index += 1) {
      accumulator.push(oneMinute.subarray(0, 401));
      accumulator.push(oneMinute.subarray(401));
    }

    const windows = accumulator.finish();

    expect(windows).toHaveLength(8);
    expect(windows.every((window) => window.rms > 0.49 && window.rms < 0.51)).toBe(true);
  });

  it.skipIf(!hasAudioBins)("finds a clear section break when loudness drops by at least 5 LUFS", async () => {
    const track = await load(fixture("clear-break.mp3"));
    const windows = await probeEnergy(track, { window_s: 0.5 });
    const boundaries = findSectionBoundaries(windows);

    expect(windows.length).toBeGreaterThanOrEqual(8);
    expect(boundaries.some((boundary) => Math.abs(boundary.time_s - 2) <= 0.5 && boundary.lufs_drop >= 5)).toBe(true);
  });

  it.skipIf(!hasAudioBins)("does not flag a subtle break below 5 LUFS", async () => {
    const track = await load(fixture("subtle-break.mp3"));
    const windows = await probeEnergy(track, { window_s: 0.5 });

    expect(findSectionBoundaries(windows)).toEqual([]);
  });

  it.skipIf(!hasAudioBins)("finds instrumental dips when music continues without overlapping transcript words", async () => {
    const track = await load(fixture("instrumental-break.mp3"));
    const windows = await probeEnergy(track, { window_s: 0.5 });
    const surroundingWords: Word[] = [
      { text: "before", start_s: 0, end_s: 1, confidence: 0.99 },
      { text: "after", start_s: 2, end_s: 3, confidence: 0.99 },
    ];

    const dips = findInstrumentalDips(windows, surroundingWords);
    expect(dips.some((dip) => dip.start_s <= 1.1 && dip.end_s >= 1.9)).toBe(true);

    const coveringWords: Word[] = [{ text: "covered", start_s: 0, end_s: track.duration_s, confidence: 0.99 }];
    expect(findInstrumentalDips(windows, coveringWords)).toEqual([]);
  });
});

function fixture(name: string): string {
  return fileURLToPath(new URL(`__fixtures__/${name}`, import.meta.url));
}

function hasBinary(binary: string): boolean {
  try {
    execFileSync("which", [binary], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function pcmSamples(samples: number[]): Buffer {
  const buffer = Buffer.alloc(samples.length * 2);

  samples.forEach((sample, index) => {
    const clamped = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(Math.round(clamped * 32767), index * 2);
  });

  return buffer;
}
