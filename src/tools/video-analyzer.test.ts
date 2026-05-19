import { describe, expect, it } from "vitest";
import videoAnalyzer, {
  buildVideoAnalysisBrief,
  classifyMotionType,
  flowVarianceForScene,
  isRemoteVideoSource,
} from "./video-analyzer.js";

describe("video_analyzer", () => {
  it("registers the video analysis capability", () => {
    expect(videoAnalyzer.name).toBe("video_analyzer");
    expect(videoAnalyzer.capability).toBe("video_analysis");
    expect(videoAnalyzer.integration).toMatchObject({ kind: "library", package: "show-sidekick" });
  });

  it("classifies remote sources and motion types", () => {
    expect(isRemoteVideoSource("https://example.com/video.mp4")).toBe(true);
    expect(isRemoteVideoSource("/tmp/video.mp4")).toBe(false);
    expect(classifyMotionType({ media_kind: "image", width: 1200, height: 800 })).toBe("static_image");
    expect(classifyMotionType({ media_kind: "video", duration_s: 0.5 })).toBe("animated_still");
    expect(classifyMotionType({ media_kind: "video", duration_s: 4 })).toBe("motion_clip");
  });

  it("builds a five-aspect video analysis brief", () => {
    const brief = buildVideoAnalysisBrief(
      [
        { index: 0, start_s: 0, end_s: 1 },
        { index: 1, start_s: 1, end_s: 5 },
      ],
      { media_kind: "video", width: 1920, height: 1080, duration_s: 5 },
    );

    expect(videoAnalyzer.output.parse(brief).scenes).toHaveLength(2);
    expect(brief.scenes[0]).toMatchObject({
      subject: ["unclassified_subject"],
      subject_motion: ["unclassified_motion"],
      scene: ["video_source"],
      spatial_framing: ["wide_frame"],
      camera: ["unclassified_camera"],
      motion_type: "motion_clip",
    });
  });

  it("calculates flow variance from scene duration", () => {
    expect(flowVarianceForScene({ index: 0, start_s: 0, end_s: 3 }, 2)).toBe(0.5);
  });
});
