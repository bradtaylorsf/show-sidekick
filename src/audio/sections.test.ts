import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { detectSections, detectSectionsFromWindows } from "./sections.js";
import { load } from "./load.js";
import type { AudioTrack, EnergyWindow, Segment } from "./types.js";

const hasAudioBins = hasBinary("ffmpeg") && hasBinary("ffprobe");

describe("detectSections", () => {
  it.skipIf(!hasAudioBins)("finds a loudness-drop boundary within 200ms on the clear-break fixture", async () => {
    const track = await load(fixture("clear-break.mp3"));
    const sections = await detectSections(track, { min_section_s: 0.5, window_s: 0.5 });

    expect(sections.length).toBeGreaterThanOrEqual(2);
    expect(sections.some((section) => Math.abs(section.start_s - 2) <= 0.2)).toBe(true);
  });

  it.skipIf(!hasAudioBins)("detects at least three sections in a fixture song with an obvious silent gap", async () => {
    const track = await load(fixture("three-section.mp3"));
    const sections = await detectSections(track, {
      min_section_s: 0.4,
      silence_min_duration_s: 0.25,
      window_s: 0.25,
    });

    expect(sections.length).toBeGreaterThanOrEqual(3);
    expect(sections.some((section) => Math.abs(section.start_s - 1.5) <= 0.2)).toBe(true);
    expect(sections.some((section) => section.kind === "silence")).toBe(true);
  });

  it.skipIf(!hasAudioBins)("uses transcript presence to classify vocal and instrumental sections", async () => {
    const track = await load(fixture("instrumental-break.mp3"));
    const sections = await detectSections(track, {
      min_section_s: 0.5,
      window_s: 0.5,
      transcript_hint: [segment("vocal", 0, track.duration_s / 2)],
    });

    expect(sections.some((section) => section.kind === "vocal" && section.start_s < track.duration_s / 2)).toBe(true);
    expect(sections.some((section) => section.kind === "instrumental" && section.end_s > track.duration_s / 2)).toBe(true);
  });

  it.skipIf(!hasAudioBins)("merges sections when min_section_s exceeds track duration", async () => {
    const track = await load(fixture("clear-break.mp3"));
    const sections = await detectSections(track, { min_section_s: 10, window_s: 0.5 });

    expect(sections).toHaveLength(1);
    expect(sections[0]?.start_s).toBe(0);
    expect(sections[0]?.end_s).toBeCloseTo(track.duration_s, 3);
  });
});

describe("detectSectionsFromWindows", () => {
  it("merges boundaries and classifies silence, vocal, and instrumental regions without spawning ffmpeg", () => {
    const sections = detectSectionsFromWindows(track(), windows(), {
      min_section_s: 0.5,
      silence_regions: [{ start_s: 1, end_s: 2 }],
      transcript_hint: [segment("spoken", 0, 1)],
    });

    expect(sections.map((section) => section.kind)).toEqual(["vocal", "silence", "instrumental"]);
    expect(sections.map((section) => section.start_s)).toEqual([0, 1, 2]);
    expect(sections[0]?.energy).toBeCloseTo(1);
    expect(sections[1]?.energy).toBeLessThan(0.1);
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

function track(): AudioTrack {
  return {
    path: "/tmp/pure.wav",
    duration_s: 3,
    sample_rate: 44_100,
    channels: 1,
  };
}

function windows(): EnergyWindow[] {
  return [
    { start_s: 0, end_s: 1, rms: 0.8, lufs: -2 },
    { start_s: 1, end_s: 2, rms: 0, lufs: -120 },
    { start_s: 2, end_s: 3, rms: 0.6, lufs: -4 },
  ];
}

function segment(text: string, start_s: number, end_s: number): Segment {
  return {
    start_s,
    end_s,
    text,
    words: [{ text, start_s, end_s, confidence: 0.99 }],
  };
}
