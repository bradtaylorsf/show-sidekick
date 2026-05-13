import { describe, expect, it } from "vitest";
import videoUnderstand, { inferUnderstandingDuration, summarizeUnderstanding } from "./video-understand.js";

describe("video_understand", () => {
  it("registers the video understanding capability", () => {
    expect(videoUnderstand.name).toBe("video_understand");
    expect(videoUnderstand.capability).toBe("video_understanding");
    expect(videoUnderstand.integration).toMatchObject({ kind: "library", package: "predit" });
  });

  it("parses inputs and fixture-like outputs", () => {
    expect(videoUnderstand.input.parse({ path: "fixture.mp4" }).frame_count).toBe(6);

    expect(
      videoUnderstand.output.parse({
        summary: "Sampled 2 frames. Transcript: hello world",
        frames: [
          { index: 0, time_s: 0.5, path: "/tmp/frame_0000.png" },
          { index: 1, time_s: 1.5, path: "/tmp/frame_0001.png" },
        ],
        transcript_segments: [{ text: "hello world", start_s: 0, end_s: 1.8 }],
        duration_s: 1.8,
      }).summary,
    ).toContain("Transcript");
  });

  it("summarizes sampled frames and transcript segments", () => {
    const frames = [
      { index: 0, time_s: 0.5, path: "/tmp/frame_0000.png" },
      { index: 1, time_s: 2.5, path: "/tmp/frame_0001.png" },
    ];
    const transcriptSegments = [{ text: "A host introduces the clip.", start_s: 0, end_s: 2.8 }];

    expect(summarizeUnderstanding(frames, transcriptSegments)).toContain("A host introduces the clip.");
    expect(inferUnderstandingDuration(frames, transcriptSegments)).toBe(2.8);
  });
});
