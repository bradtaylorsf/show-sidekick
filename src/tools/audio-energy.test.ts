import { describe, expect, it } from "vitest";
import audioEnergy, { parseAudioEnergyLog } from "./audio-energy.js";

describe("audio_energy", () => {
  it("registers the audio energy capability", () => {
    expect(audioEnergy.name).toBe("audio_energy");
    expect(audioEnergy.capability).toBe("audio_energy");
    expect(audioEnergy.integration).toMatchObject({ kind: "binary", binary: "ffmpeg" });
  });

  it("parses ffmpeg astats and loudness metadata into windows", () => {
    const parsed = parseAudioEnergyLog(
      [
        "frame:0 pts:0 pts_time:0.000000",
        "lavfi.astats.Overall.RMS_level=-18.5",
        "lavfi.r128.M=-21.25",
        "frame:1 pts:24000 pts_time:0.500000",
        "lavfi.astats.Overall.RMS_level=-12.0",
        "lavfi.r128.M=-16.75",
      ].join("\n"),
      0.5,
    );

    expect(audioEnergy.output.parse(parsed)).toEqual({
      windows: [
        { start_s: 0, end_s: 0.5, rms: -18.5, lufs: -21.25 },
        { start_s: 0.5, end_s: 1, rms: -12, lufs: -16.75 },
      ],
    });
  });
});
