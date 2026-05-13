import { describe, expect, it } from "vitest";
import bgRemove from "./bg-remove.js";

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

describe("bg_remove", () => {
  it("registers the background removal capability marker", async () => {
    expect(bgRemove.name).toBe("bg_remove");
    expect(bgRemove.capability).toBe("bg_remove");
    expect(bgRemove.integration).toMatchObject({ kind: "library", package: "predit" });
    await expect(bgRemove.isAvailable()).resolves.toEqual({ available: true });
  });

  it("parses input and output schemas", () => {
    expect(
      bgRemove.input.parse({
        source_path: "portrait.jpg",
        output_path: "portrait-alpha.png",
        format: "png",
      }).format,
    ).toBe("png");

    expect(
      bgRemove.output.parse({
        output_path: "portrait-alpha.png",
      }).provider_metadata,
    ).toEqual({});
  });

  it("throws a clear marker error when executed directly", async () => {
    await expect(
      bgRemove.execute(
        {
          source_path: "portrait.jpg",
          output_path: "portrait-alpha.png",
          format: "png",
        },
        ctx,
      ),
    ).rejects.toThrow(/capability marker/);
  });
});
