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

  it("does not route prompt generation to specialty image tools", async () => {
    const specialtyExecute = vi.fn(async () => ({ image_path: "specialty.png" }));
    const promptExecute = vi.fn(async (params: unknown) => ({ image_path: "prompt.png", params }));
    const registry = new Registry({
      tools: [
        specialtyTool("code_snippet", "code", specialtyExecute),
        imageTool("openai_image", "openai", { execute: promptExecute }),
      ],
    });

    const result = await imageGen.generate({ prompt: "a forest" }, testContext(registry));

    expect(specialtyExecute).not.toHaveBeenCalled();
    expect(promptExecute).toHaveBeenCalledWith({ prompt: "a forest" }, expect.objectContaining({ projectRoot: expect.any(String) }));
    expect(result).toMatchObject({ image_path: "prompt.png" });
  });

  it("errors clearly when only specialty image tools are available for a prompt", async () => {
    const registry = new Registry({
      tools: [specialtyTool("code_snippet", "code", vi.fn(async () => ({ image_path: "specialty.png" })))],
    });

    await expect(imageGen.generate({ prompt: "a forest" }, testContext(registry))).rejects.toThrow(
      "No prompt-to-image tool available",
    );
  });

  it("can deliberately route prompt-like stock searches to stock_image tools", async () => {
    const execute = vi.fn(async (params: unknown) => ({ results: [], params, provider: "pexels", cost_usd: 0 }));
    const registry = new Registry({
      tools: [stockTool("pexels_stock", "pexels", execute)],
    });

    const result = await imageGen.generate(
      { source: "stock", provider: "pexels", prompt: "forest trail", count: 3, download_top: false },
      testContext(registry),
    );

    expect(execute).toHaveBeenCalledWith(
      { query: "forest trail", per_page: 3, download_top: false },
      expect.objectContaining({ projectRoot: expect.any(String) }),
    );
    expect(result).toMatchObject({ provider: "pexels" });
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

function specialtyTool(name: string, provider: string, execute: Tool["execute"]): Tool {
  return defineTool({
    name,
    capability: "image_generation",
    provider,
    status: "beta",
    integration: { kind: "library", package: "fixture", install: "test" },
    best_for: "specialty image rendering test",
    input: z.object({ code: z.string() }),
    output: z.unknown(),
    isAvailable: async () => ({ available: true }),
    execute,
  });
}

function stockTool(name: string, provider: string, execute: Tool["execute"]): Tool {
  return defineTool({
    name,
    capability: "stock_image",
    provider,
    status: "beta",
    integration: { kind: "api", env: [], install: "test" },
    best_for: "stock image routing test",
    input: z.object({ query: z.string(), per_page: z.number().optional(), download_top: z.boolean().optional() }),
    output: z.unknown(),
    isAvailable: async () => ({ available: true }),
    execute,
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
