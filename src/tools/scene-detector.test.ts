import { describe, expect, it } from "vitest";
import sceneDetector, { buildScenes, parseSceneCutTimes } from "./scene-detector.js";

describe("scene_detector", () => {
  it("registers the scene detection capability", () => {
    expect(sceneDetector.name).toBe("scene_detector");
    expect(sceneDetector.capability).toBe("scene_detection");
    expect(sceneDetector.integration).toMatchObject({ kind: "binary", binary: "ffmpeg" });
  });

  it("parses ffmpeg metadata cut timestamps", () => {
    const log = [
      "frame:12 pts:24000 pts_time:1.000000",
      "lavfi.scene_score=0.503",
      "frame:51 pts:96000 pts_time:4.000000",
      "lavfi.scene_score=0.882",
    ].join("\n");

    expect(parseSceneCutTimes(log)).toEqual([1, 4]);
  });

  it("turns cut points into ordered scene ranges", () => {
    expect(sceneDetector.output.parse(buildScenes(6, [1, 4]))).toEqual({
      scenes: [
        { index: 0, start_s: 0, end_s: 1 },
        { index: 1, start_s: 1, end_s: 4 },
        { index: 2, start_s: 4, end_s: 6 },
      ],
    });
  });
});
