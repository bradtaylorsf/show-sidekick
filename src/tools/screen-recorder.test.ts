import { describe, expect, it } from "vitest";
import screenRecorder, { buildScreenRecorderArgs } from "./screen-recorder.js";

describe("screen_recorder", () => {
  it("registers the ffmpeg screen capture provider", () => {
    expect(screenRecorder.name).toBe("screen_recorder");
    expect(screenRecorder.capability).toBe("screen_capture");
    expect(screenRecorder.provider).toBe("ffmpeg");
    expect(screenRecorder.integration).toMatchObject({ kind: "binary", binary: "ffmpeg" });
  });

  it("parses input and output schemas", () => {
    expect(
      screenRecorder.input.parse({
        output_path: "/tmp/screen.mp4",
        duration_s: 3,
      }).duration_s,
    ).toBe(3);

    expect(
      screenRecorder.output.parse({
        video_path: "/tmp/screen.mp4",
        duration_s: 3,
      }).video_path,
    ).toBe("/tmp/screen.mp4");
  });

  it("builds macOS avfoundation capture arguments", () => {
    expect(
      buildScreenRecorderArgs(
        {
          output_path: "/tmp/screen.mp4",
          duration_s: 3,
          display: "2",
        },
        "darwin",
      ),
    ).toEqual(["-hide_banner", "-y", "-f", "avfoundation", "-i", "2:none", "-t", "3", "/tmp/screen.mp4"]);
  });

  it("builds Linux x11grab capture arguments", () => {
    expect(
      buildScreenRecorderArgs(
        {
          output_path: "/tmp/screen.mp4",
          duration_s: 3,
        },
        "linux",
      ),
    ).toEqual(["-hide_banner", "-y", "-f", "x11grab", "-i", ":0.0", "-t", "3", "/tmp/screen.mp4"]);
  });

  it("rejects unsupported platforms with a clear error", () => {
    expect(() =>
      buildScreenRecorderArgs(
        {
          output_path: "/tmp/screen.mp4",
          duration_s: 3,
        },
        "win32",
      ),
    ).toThrow(/does not support platform: win32/);
  });
});
