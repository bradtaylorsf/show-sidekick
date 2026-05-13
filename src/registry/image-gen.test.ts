import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool } from "./define-tool.js";
import { NoToolAvailable } from "./errors.js";
import { imageGen } from "./image-gen.js";
import { Registry } from "./registry.js";
import type { Availability, Tool } from "./tool.js";

describe("image generation routing", () => {
  it("selects an available image_generation tool and skips unavailable candidates", async () => {
    const registry = new Registry({
      tools: [
        imageTool("unavailable_image", "a", { availability: { available: false, reason: "missing env" } }),
        imageTool("ready_image", "b"),
      ],
    });

    await expect(registry.select("image_generation")).resolves.toMatchObject({ name: "ready_image" });
  });

  it("respects preferred image_generation tools", async () => {
    const registry = new Registry({
      tools: [imageTool("first_image", "first"), imageTool("second_image", "second")],
    });

    await expect(registry.select("image_generation", { prefer: ["second_image"] })).resolves.toMatchObject({
      name: "second_image",
    });
  });

  it("throws NoToolAvailable with candidate reasons when no image tool can run", async () => {
    const registry = new Registry({
      tools: [
        imageTool("first_image", "first", { availability: { available: false, reason: "missing env" } }),
        imageTool("second_image", "second", { availability: { available: false, reason: "quota exhausted" } }),
      ],
    });

    await expect(registry.select("image_generation")).rejects.toMatchObject({
      capability: "image_generation",
      reasons: [
        { name: "first_image", reason: "missing env" },
        { name: "second_image", reason: "quota exhausted" },
      ],
    });
    await expect(registry.select("image_generation")).rejects.toBeInstanceOf(NoToolAvailable);
  });

  it("generates through the ergonomic wrapper with provider preferences and adapted params", async () => {
    const execute = vi.fn(async (params: unknown) => ({ image_path: "out.png", params }));
    const registry = new Registry({
      tools: [imageTool("first_image", "first"), imageTool("openai_image", "openai", { execute })],
    });

    const result = await imageGen.generate(
      {
        prompt: "a clean product shot",
        provider: "openai",
        size: "1024x1024",
        extra: { quality: "high" },
      },
      testContext(registry),
    );

    expect(execute).toHaveBeenCalledWith(
      { prompt: "a clean product shot", size: "1024x1024", quality: "high" },
      expect.objectContaining({ projectRoot: expect.any(String) }),
    );
    expect(result).toMatchObject({ image_path: "out.png" });
  });
});

function imageTool(
  name: string,
  provider: string,
  options: {
    availability?: Availability;
    execute?: Tool["execute"];
  } = {},
): Tool {
  return defineTool({
    name,
    capability: "image_generation",
    provider,
    status: "beta",
    integration: { kind: "api", env: [], install: "test" },
    best_for: "image generation routing test",
    input: z.record(z.unknown()),
    output: z.unknown(),
    isAvailable: async () => options.availability ?? { available: true },
    execute: options.execute ?? (async (params) => ({ params })),
  });
}

function testContext(registry: Registry) {
  return {
    projectRoot: process.cwd(),
    registry,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
