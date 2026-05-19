import { describe, expect, it } from "vitest";
import faceRestore from "./face-restore.js";

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

describe("face_restore", () => {
  it("registers the face restore capability marker", async () => {
    expect(faceRestore.name).toBe("face_restore");
    expect(faceRestore.capability).toBe("face_restore");
    expect(faceRestore.integration).toMatchObject({ kind: "library", package: "show-sidekick" });
    await expect(faceRestore.isAvailable()).resolves.toEqual({ available: true });
  });

  it("parses input and output schemas", () => {
    expect(
      faceRestore.input.parse({
        source_path: "archive-face.jpg",
        output_path: "archive-face-restored.jpg",
        strength: 0.8,
      }).strength,
    ).toBe(0.8);

    expect(
      faceRestore.output.parse({
        output_path: "archive-face-restored.jpg",
      }).provider_metadata,
    ).toEqual({});
  });

  it("throws a clear marker error when executed directly", async () => {
    await expect(
      faceRestore.execute(
        {
          source_path: "archive-face.jpg",
          output_path: "archive-face-restored.jpg",
          strength: 0.8,
        },
        ctx,
      ),
    ).rejects.toThrow(/capability marker/);
  });
});
