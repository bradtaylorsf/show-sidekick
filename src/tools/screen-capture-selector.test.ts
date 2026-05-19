import { describe, expect, it } from "vitest";
import screenCaptureSelector from "./screen-capture-selector.js";

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

describe("screen_capture_selector", () => {
  it("registers the screen capture capability marker", async () => {
    expect(screenCaptureSelector.name).toBe("screen_capture_selector");
    expect(screenCaptureSelector.capability).toBe("screen_capture");
    expect(screenCaptureSelector.integration).toMatchObject({ kind: "library", package: "show-sidekick" });
    await expect(screenCaptureSelector.isAvailable()).resolves.toEqual({ available: true });
  });

  it("parses input and output schemas", () => {
    expect(
      screenCaptureSelector.input.parse({
        output_path: "/tmp/screen.mp4",
        duration_s: 3,
      }).output_path,
    ).toBe("/tmp/screen.mp4");

    expect(
      screenCaptureSelector.output.parse({
        video_path: "/tmp/screen.mp4",
        duration_s: 3,
      }).duration_s,
    ).toBe(3);
  });

  it("throws a clear marker error when executed directly", async () => {
    await expect(
      screenCaptureSelector.execute(
        {
          output_path: "/tmp/screen.mp4",
          duration_s: 3,
        },
        ctx,
      ),
    ).rejects.toThrow(/capability marker/);
  });
});
