import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import audioEnergy, { parseAudioEnergyLog } from "./audio-energy.js";

const fixturePath = fileURLToPath(new URL("./__fixtures__/ebur128-stderr.txt", import.meta.url));

describe("audio_energy", () => {
  it("registers the audio energy capability", () => {
    expect(audioEnergy.name).toBe("audio_energy");
    expect(audioEnergy.capability).toBe("audio_energy");
    expect(audioEnergy.integration).toMatchObject({ kind: "binary", binary: "ffmpeg" });
  });

  it("parses FFmpeg EBU R128 momentary loudness into the audio energy artifact", async () => {
    const parsed = parseAudioEnergyLog(await readFile(fixturePath, "utf8"), {
      window_s: 1,
      silence_threshold_lufs: -45,
      best_window_s: 2,
    });

    expect(audioEnergy.output.parse(parsed)).toMatchObject({
      source: "ffmpeg-ebur128",
      first_active_s: 2,
      peak_s: 5,
      recommended_offset_s: 2,
      best_window: {
        start_s: 4,
        end_s: 6,
        peak_lufs: -13,
      },
    });
    expect(parsed.raw_points.slice(0, 2)).toEqual([
      { time_s: 0.1, momentary_lufs: -120, is_silence: true },
      { time_s: 1, momentary_lufs: -120, is_silence: true },
    ]);
    expect(parsed.energy_profile.map((window) => ({ start_s: window.start_s, end_s: window.end_s, lufs: window.lufs }))).toEqual([
      { start_s: 0, end_s: 1, lufs: -120 },
      { start_s: 1, end_s: 2, lufs: -120 },
      { start_s: 2, end_s: 3, lufs: -38.5 },
      { start_s: 3, end_s: 4, lufs: -18 },
      { start_s: 4, end_s: 5, lufs: -14.5 },
      { start_s: 5, end_s: 6, lufs: -13 },
      { start_s: 6, end_s: 7, lufs: -28 },
    ]);
  });
});
