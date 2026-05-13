import { describe, expect, it } from "vitest";
import upscale from "./upscale.js";

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

describe("upscale", () => {
  it("registers the upscale capability marker", async () => {
    expect(upscale.name).toBe("upscale");
    expect(upscale.capability).toBe("upscale");
    expect(upscale.integration).toMatchObject({ kind: "library", package: "predit" });
    await expect(upscale.isAvailable()).resolves.toEqual({ available: true });
  });

  it("parses input and output schemas", () => {
    expect(
      upscale.input.parse({
        source_path: "still.png",
        output_path: "still-4x.png",
        scale: 4,
      }).scale,
    ).toBe(4);

    expect(
      upscale.output.parse({
        output_path: "still-4x.png",
        width: 3840,
        height: 2160,
      }).provider_metadata,
    ).toEqual({});
  });

  it("throws a clear marker error when executed directly", async () => {
    await expect(
      upscale.execute(
        {
          source_path: "still.png",
          output_path: "still-4x.png",
          scale: 4,
        },
        ctx,
      ),
    ).rejects.toThrow(/capability marker/);
  });
});
