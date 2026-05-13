import { describe, expect, it } from "vitest";
import eyeEnhance from "./eye-enhance.js";

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

describe("eye_enhance", () => {
  it("registers the eye enhance capability marker", async () => {
    expect(eyeEnhance.name).toBe("eye_enhance");
    expect(eyeEnhance.capability).toBe("eye_enhance");
    expect(eyeEnhance.integration).toMatchObject({ kind: "library", package: "predit" });
    await expect(eyeEnhance.isAvailable()).resolves.toEqual({ available: true });
  });

  it("parses input and output schemas", () => {
    expect(
      eyeEnhance.input.parse({
        source_path: "portrait.png",
        output_path: "portrait-eyes.png",
        strength: 0.7,
      }).strength,
    ).toBe(0.7);

    expect(
      eyeEnhance.output.parse({
        output_path: "portrait-eyes.png",
      }).provider_metadata,
    ).toEqual({});
  });

  it("throws a clear marker error when executed directly", async () => {
    await expect(
      eyeEnhance.execute(
        {
          source_path: "portrait.png",
          output_path: "portrait-eyes.png",
          strength: 0.7,
        },
        ctx,
      ),
    ).rejects.toThrow(/capability marker/);
  });
});
