import { describe, expect, it } from "vitest";
import lipSync from "./lip-sync.js";

const ctx = {
  projectRoot: "/tmp/predit",
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  },
};

describe("lip_sync", () => {
  it("registers the lip sync capability marker", async () => {
    expect(lipSync.name).toBe("lip_sync");
    expect(lipSync.capability).toBe("lip_sync");
    expect(lipSync.integration).toMatchObject({ kind: "library", package: "show-sidekick" });
    await expect(lipSync.isAvailable()).resolves.toEqual({ available: true });
  });

  it("parses input and output schemas", () => {
    expect(
      lipSync.input.parse({
        audio_path: "voice.wav",
        source_path: "portrait.png",
        output_path: "talking.mp4",
      }).source_path,
    ).toBe("portrait.png");

    expect(
      lipSync.output.parse({
        video_path: "talking.mp4",
        duration_s: 3,
        source_modality: "still",
      }).source_modality,
    ).toBe("still");
  });

  it("throws a clear marker error when executed directly", async () => {
    await expect(
      lipSync.execute(
        {
          audio_path: "voice.wav",
          source_path: "portrait.png",
          output_path: "talking.mp4",
        },
        ctx,
      ),
    ).rejects.toThrow(/capability marker/);
  });
});
