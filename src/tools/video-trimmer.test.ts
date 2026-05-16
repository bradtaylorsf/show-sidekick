import { describe, expect, it } from "vitest";
import { VideoTrimmerOutputSchema } from "./video-trimmer.js";

describe("video_trimmer output schema", () => {
  it("captures requested-vs-actual trim drift metrics", () => {
    const parsed = VideoTrimmerOutputSchema.parse({
      operation: "video_trimmer",
      stdout: "",
      stderr: "",
      exit_code: 0,
      output_path: "clips/trimmed.mp4",
      requested_duration_s: 5,
      actual_duration_s: 5.016,
      drift_s: 0.016,
      drift_frames: 0.48,
      tolerance_s: 1 / 30,
      within_tolerance: true,
    });

    expect(parsed).toMatchObject({
      requested_duration_s: 5,
      actual_duration_s: 5.016,
      drift_frames: 0.48,
      within_tolerance: true,
    });
  });
});
