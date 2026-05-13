import { describe, expect, it } from "vitest";
import visualQa, { createVisualQaResult } from "./visual-qa.js";

describe("visual_qa", () => {
  it("registers the visual QA capability marker", async () => {
    expect(visualQa.name).toBe("visual_qa");
    expect(visualQa.capability).toBe("visual_qa");
    expect(visualQa.integration).toMatchObject({ kind: "library", package: "predit" });
    await expect(visualQa.isAvailable()).resolves.toEqual({ available: true });
  });

  it("parses criteria input and returns passing empty findings", () => {
    expect(visualQa.input.parse({ frame_paths: ["frame.png"] }).criteria).toEqual([]);
    expect(createVisualQaResult()).toEqual({ findings: [], passed: true });
  });

  it("fails when a critical finding is present", () => {
    expect(
      createVisualQaResult([
        {
          frame_path: "frame.png",
          severity: "critical",
          description: "Subject is cropped out of frame.",
        },
      ]).passed,
    ).toBe(false);
  });
});
