import { describe, expect, it } from "vitest";
import faceEnhance from "./face-enhance.js";

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

describe("face_enhance", () => {
  it("registers the face enhance capability marker", async () => {
    expect(faceEnhance.name).toBe("face_enhance");
    expect(faceEnhance.capability).toBe("face_enhance");
    expect(faceEnhance.integration).toMatchObject({ kind: "library", package: "show-sidekick" });
    await expect(faceEnhance.isAvailable()).resolves.toEqual({ available: true });
  });

  it("parses input and output schemas", () => {
    expect(
      faceEnhance.input.parse({
        source_path: "portrait.png",
        output_path: "portrait-face.png",
        strength: 0.6,
      }).strength,
    ).toBe(0.6);

    expect(
      faceEnhance.output.parse({
        output_path: "portrait-face.png",
      }).provider_metadata,
    ).toEqual({});
  });

  it("throws a clear marker error when executed directly", async () => {
    await expect(
      faceEnhance.execute(
        {
          source_path: "portrait.png",
          output_path: "portrait-face.png",
          strength: 0.6,
        },
        ctx,
      ),
    ).rejects.toThrow(/capability marker/);
  });
});
