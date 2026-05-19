import { describe, expect, it } from "vitest";
import colorGrade from "./color-grade.js";

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

describe("color_grade", () => {
  it("registers the color grade capability marker", async () => {
    expect(colorGrade.name).toBe("color_grade");
    expect(colorGrade.capability).toBe("color_grade");
    expect(colorGrade.integration).toMatchObject({ kind: "library", package: "show-sidekick" });
    await expect(colorGrade.isAvailable()).resolves.toEqual({ available: true });
  });

  it("parses input and output schemas", () => {
    expect(
      colorGrade.input.parse({
        source_path: "scene.mov",
        output_path: "scene-graded.mov",
        lut_path: "look.cube",
        contrast: 1.1,
        saturation: 0.9,
      }).lut_path,
    ).toBe("look.cube");

    expect(
      colorGrade.output.parse({
        output_path: "scene-graded.mov",
      }).provider_metadata,
    ).toEqual({});
  });

  it("throws a clear marker error when executed directly", async () => {
    await expect(
      colorGrade.execute(
        {
          source_path: "scene.mov",
          output_path: "scene-graded.mov",
          lut_path: "look.cube",
          contrast: 1.1,
          saturation: 0.9,
        },
        ctx,
      ),
    ).rejects.toThrow(/capability marker/);
  });
});
