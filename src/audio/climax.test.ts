import { describe, expect, it } from "vitest";
import { detectClimax } from "./climax.js";
import type { AudioTrack, ClimaxPoint, EnergyWindow, Section } from "./types.js";

describe("detectClimax", () => {
  it("detects one clear chorus peak", async () => {
    const result = await detectClimax(track(12), clearChorusFixture());

    expect(result.filter((point) => point.source === "algorithm")).toHaveLength(1);
    expect(result[0]?.time_s).toBeGreaterThanOrEqual(5.8);
    expect(result[0]?.time_s).toBeLessThanOrEqual(6.8);
    expect(result[0]?.intensity).toBe(1);
  });

  it("detects two separated chorus peaks", async () => {
    const result = await detectClimax(track(18), doubleChorusFixture());

    expect(result).toHaveLength(2);
    expect(result[1]?.time_s ?? 0).toBeGreaterThan((result[0]?.time_s ?? 0) + 3);
  });

  it("filters a louder but short instrumental false peak", async () => {
    const result = await detectClimax(track(14), falsePeakInstrumentalFixture());

    expect(result).toHaveLength(1);
    expect(result[0]?.time_s).toBeGreaterThan(7);
    expect(result[0]?.time_s).toBeLessThan(10);
  });

  it("returns empty for a flat ambient track", async () => {
    const result = await detectClimax(track(10), noPeakAmbientFixture());

    expect(result).toEqual([]);
  });

  it("preserves manual climax points verbatim across reruns", async () => {
    const manual: ClimaxPoint = {
      time_s: 4.25,
      type: "arrival",
      intensity: 0.88,
      source: "manual",
    };

    const result = await detectClimax(track(10), {
      ...noPeakAmbientFixture(),
      manual: [manual],
    });

    expect(result).toEqual([manual]);
  });
});

function track(duration_s: number): AudioTrack {
  return {
    path: "/tmp/audio.wav",
    duration_s,
    sample_rate: 44_100,
    channels: 1,
  };
}

function clearChorusFixture(): { sections: Section[]; windows: EnergyWindow[] } {
  return {
    sections: [
      section("intro", 0, 4, "instrumental"),
      section("chorus", 4, 10, "vocal"),
      section("outro", 10, 12, "instrumental"),
    ],
    windows: windows([0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.15, 0.2, 0.45, 0.55, 0.68, 0.82, 0.98, 0.9, 0.68, 0.58, 0.54, 0.52, 0.5, 0.46, 0.22, 0.18, 0.16, 0.15]),
  };
}

function doubleChorusFixture(): { sections: Section[]; windows: EnergyWindow[] } {
  return {
    sections: [
      section("chorus-1", 0, 6, "vocal"),
      section("verse", 6, 11, "vocal"),
      section("chorus-2", 11, 17, "vocal"),
      section("tail", 17, 18, "instrumental"),
    ],
    windows: windows([
      0.3, 0.42, 0.58, 0.86, 0.95, 0.8, 0.56, 0.42, 0.32, 0.28, 0.24, 0.22,
      0.22, 0.24, 0.27, 0.29, 0.28, 0.27, 0.3, 0.35, 0.42, 0.58,
      0.72, 0.9, 0.96, 0.82, 0.65, 0.5, 0.38, 0.3, 0.24, 0.2, 0.18, 0.16, 0.14, 0.12,
    ]),
  };
}

function falsePeakInstrumentalFixture(): { sections: Section[]; windows: EnergyWindow[] } {
  return {
    sections: [
      section("verse", 0, 4, "vocal"),
      section("instrumental-break", 4, 5.5, "instrumental"),
      section("chorus", 5.5, 11.5, "vocal"),
      section("outro", 11.5, 14, "instrumental"),
    ],
    windows: windows([
      0.22, 0.24, 0.26, 0.25, 0.24, 0.23, 0.22, 0.24,
      0.35, 1.0, 0.36,
      0.38, 0.42, 0.5, 0.58, 0.66, 0.76, 0.82, 0.78, 0.66, 0.54, 0.46, 0.4,
      0.28, 0.22, 0.18, 0.16, 0.14,
    ]),
  };
}

function noPeakAmbientFixture(): { sections: Section[]; windows: EnergyWindow[] } {
  return {
    sections: [section("ambient", 0, 10, "instrumental")],
    windows: windows(Array.from({ length: 20 }, () => 0.2)),
  };
}

function section(label: string, start_s: number, end_s: number, kind: Section["kind"]): Section {
  return {
    label,
    start_s,
    end_s,
    kind,
    energy: 0.5,
  };
}

function windows(values: number[]): EnergyWindow[] {
  return values.map((rms, index) => ({
    start_s: index * 0.5,
    end_s: index * 0.5 + 0.5,
    rms,
    lufs: rms > 0 ? 20 * Math.log10(rms) : -120,
  }));
}
