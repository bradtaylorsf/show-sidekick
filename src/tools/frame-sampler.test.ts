import { describe, expect, it } from "vitest";
import frameSampler, { framePath, mergeSceneAwareSampleTimes, uniformSampleTimes } from "./frame-sampler.js";

describe("frame_sampler", () => {
  it("registers the frame sampling capability", () => {
    expect(frameSampler.name).toBe("frame_sampler");
    expect(frameSampler.capability).toBe("frame_sampling");
    expect(frameSampler.integration).toMatchObject({ kind: "binary", binary: "ffmpeg" });
  });

  it("calculates uniform midpoint frame sample times", () => {
    expect(uniformSampleTimes(10, 4)).toEqual([1.25, 3.75, 6.25, 8.75]);
  });

  it("prefers scene-aware cut times and fills remaining frames uniformly", () => {
    expect(mergeSceneAwareSampleTimes(8, 4, [1.1, 3.2])).toEqual([1.1, 3.2, 1, 3]);
  });

  it("creates stable output frame paths", () => {
    expect(framePath("/tmp/frames", 12)).toBe("/tmp/frames/frame_0012.png");
  });
});
