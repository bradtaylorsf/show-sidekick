import { describe, expect, it } from "vitest";
import capRecorder, { buildCapRecorderArgs } from "./cap-recorder.js";

describe("cap_recorder", () => {
  it("registers the Cap screen capture provider", () => {
    expect(capRecorder.name).toBe("cap_recorder");
    expect(capRecorder.capability).toBe("screen_capture");
    expect(capRecorder.provider).toBe("cap");
    expect(capRecorder.integration).toMatchObject({ kind: "cli", binary: "cap", auth: { mode: "none" } });
  });

  it("parses input and output schemas", () => {
    expect(
      capRecorder.input.parse({
        output_path: "/tmp/capture.mp4",
        region: "screen",
      }).region,
    ).toBe("screen");

    expect(
      capRecorder.output.parse({
        video_path: "/tmp/capture.mp4",
        duration_s: 5,
      }).provider_metadata,
    ).toEqual({});
  });

  it("builds deterministic Cap CLI arguments", () => {
    expect(
      buildCapRecorderArgs({
        output_path: "/tmp/capture.mp4",
        duration_s: 4,
        region: { x: 10, y: 20, w: 1280, h: 720 },
      }),
    ).toEqual(["record", "--output", "/tmp/capture.mp4", "--duration", "4", "--region", "10,20,1280,720"]);
  });
});
