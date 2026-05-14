import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import visualQa, { createVisualQaResult } from "./visual-qa.js";

describe("visual_qa", () => {
  it("registers the visual QA capability", async () => {
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

  it("checks that sampled frame paths exist", async () => {
    const root = await mkdtemp(join(tmpdir(), "predit-visual-qa-"));
    const existingFrame = join(root, "frame.png");
    const missingFrame = join(root, "missing.png");
    await writeFile(existingFrame, "png");

    const result = await visualQa.execute(visualQa.input.parse({ frame_paths: [existingFrame, missingFrame] }), {
      projectRoot: root,
      logger: {
        info: () => undefined,
        warn: () => undefined,
        error: () => undefined,
        debug: () => undefined,
        event: () => undefined,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.findings).toEqual([
      {
        frame_path: missingFrame,
        severity: "critical",
        description: "Frame path does not exist.",
      },
    ]);
  });
});
