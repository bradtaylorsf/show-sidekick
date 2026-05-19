import { describe, expect, it } from "vitest";
import talkingHead from "./talking-head.js";

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

describe("talking_head", () => {
  it("registers the talking head capability marker", async () => {
    expect(talkingHead.name).toBe("talking_head");
    expect(talkingHead.capability).toBe("talking_head");
    expect(talkingHead.integration).toMatchObject({ kind: "library", package: "show-sidekick" });
    await expect(talkingHead.isAvailable()).resolves.toEqual({ available: true });
  });

  it("parses input and output schemas", () => {
    expect(
      talkingHead.input.parse({
        script: "Welcome.",
        voice_id: "voice-1",
        avatar_id: "avatar-1",
        output_path: "talking.mp4",
      }).voice_id,
    ).toBe("voice-1");

    expect(
      talkingHead.output.parse({
        video_path: "talking.mp4",
        duration_s: 3,
      }).provider_metadata,
    ).toEqual({});
  });

  it("throws a clear marker error when executed directly", async () => {
    await expect(
      talkingHead.execute(
        {
          script: "Welcome.",
          voice_id: "voice-1",
          avatar_id: "avatar-1",
          output_path: "talking.mp4",
        },
        ctx,
      ),
    ).rejects.toThrow(/capability marker/);
  });
});
