import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import type { Tool, ToolContext } from "../registry/tool.js";
import { stockImageOutputSchema, stockVideoInputSchema, stockVideoOutputSchema } from "../tool-support/stock-video.js";
import stockCrossSearch from "./stock_cross_search.js";

function noopLogger(): ToolContext["logger"] {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

function context(toolsByCapability: Record<string, Tool[]>, logger = noopLogger()): ToolContext {
  return {
    projectRoot: "/project",
    logger,
    registry: {
      select: async () => {
        throw new Error("not used");
      },
      listByCapability: async (capability) => toolsByCapability[capability] ?? [],
    },
  };
}

function stockVideoTool(name: string, provider: string, matches: unknown[]): Tool {
  return defineTool({
    name,
    capability: "stock_video",
    provider,
    status: "beta",
    integration: { kind: "api", env: [], install: "none" },
    best_for: "cross-search test video source",
    input: stockVideoInputSchema,
    output: stockVideoOutputSchema,
    execute: async () => ({ matches, cost_usd: 0 }),
  });
}

function stockImageTool(name: string, provider: string, matches: unknown[]): Tool {
  return defineTool({
    name,
    capability: "stock_image",
    provider,
    status: "beta",
    integration: { kind: "api", env: [], install: "none" },
    best_for: "cross-search test image source",
    input: stockVideoInputSchema,
    output: stockImageOutputSchema,
    execute: async () => ({ matches, cost_usd: 0 }),
  });
}

function failingTool(): Tool {
  return defineTool({
    name: "failing_stock",
    capability: "stock_video",
    provider: "failing",
    status: "beta",
    integration: { kind: "api", env: [], install: "none" },
    best_for: "cross-search test failing source",
    input: stockVideoInputSchema,
    output: stockVideoOutputSchema,
    execute: async () => {
      throw new Error("source unavailable");
    },
  });
}

describe("stock_cross_search", () => {
  it("fans out by configured capabilities, caps each source, and returns ranked aggregated matches", async () => {
    const videoA = stockVideoTool("nasa", "nasa", [
      {
        video_url: "https://nasa.example.com/a.mp4",
        attribution: { source: "nasa", license: "Public Domain (NASA)" },
      },
      {
        video_url: "https://nasa.example.com/b.mp4",
        attribution: { source: "nasa", license: "Public Domain (NASA)" },
      },
    ]);
    const videoB = stockVideoTool("pexels_video", "pexels", [
      {
        video_url: "https://pexels.example.com/a.mp4",
        attribution: { source: "pexels", license: "Pexels License" },
      },
    ]);
    const image = stockImageTool("unsplash", "unsplash", [
      {
        image_url: "https://images.unsplash.com/a",
        attribution: { source: "unsplash", license: "Unsplash License" },
      },
    ]);

    const result = await stockCrossSearch.execute(
      stockCrossSearch.input.parse({ query: "moon", per_source: 1 }),
      context({ stock_video: [videoA, videoB], stock_image: [image] }),
    );

    expect(result.matches.map((match) => ({ rank: match.rank, source: match.source, source_rank: match.source_rank }))).toEqual([
      { rank: 1, source: "nasa", source_rank: 1 },
      { rank: 2, source: "pexels", source_rank: 1 },
      { rank: 3, source: "unsplash", source_rank: 1 },
    ]);
    expect(result.matches.map((match) => match.tool)).toEqual(["nasa", "pexels_video", "unsplash"]);
    expect(result.matches[0]?.video_url).toBe("https://nasa.example.com/a.mp4");
    expect(result.matches[2]?.image_url).toBe("https://images.unsplash.com/a");
  });

  it("filters fan-out by requested tool or provider names", async () => {
    const nasa = stockVideoTool("nasa", "nasa", [
      { video_url: "https://nasa.example.com/a.mp4", attribution: { source: "nasa", license: "Public Domain (NASA)" } },
    ]);
    const unsplash = stockImageTool("unsplash", "unsplash", [
      { image_url: "https://images.unsplash.com/a", attribution: { source: "unsplash", license: "Unsplash License" } },
    ]);

    const result = await stockCrossSearch.execute(
      stockCrossSearch.input.parse({ query: "moon", sources: ["unsplash"] }),
      context({ stock_video: [nasa], stock_image: [unsplash] }),
    );

    expect(result.matches).toHaveLength(1);
    expect(result.matches[0]).toMatchObject({ source: "unsplash", tool: "unsplash" });
  });

  it("logs failed sources and keeps successful matches", async () => {
    const logger = { ...noopLogger(), warn: vi.fn() };
    const nasa = stockVideoTool("nasa", "nasa", [
      { video_url: "https://nasa.example.com/a.mp4", attribution: { source: "nasa", license: "Public Domain (NASA)" } },
    ]);

    const result = await stockCrossSearch.execute(
      stockCrossSearch.input.parse({ query: "moon" }),
      context({ stock_video: [failingTool(), nasa], stock_image: [] }, logger),
    );

    expect(result.matches.map((match) => match.source)).toEqual(["nasa"]);
    expect(logger.warn).toHaveBeenCalledWith("stock source search failed", {
      tool: "failing_stock",
      error: "source unavailable",
    });
  });

  it("throws a clear error when the registry cannot enumerate source capabilities", async () => {
    await expect(
      stockCrossSearch.execute(stockCrossSearch.input.parse({ query: "moon" }), {
        projectRoot: "/project",
        logger: noopLogger(),
        registry: {
          select: async () => {
            throw new Error("not used");
          },
        },
      }),
    ).rejects.toThrow("stock source capability listing required (G-6)");
  });

  it("validates its input shape", () => {
    expect(stockCrossSearch.input.parse({ query: "moon", per_source: 2, capabilities: ["stock_video"] })).toMatchObject({
      query: "moon",
      per_source: 2,
      capabilities: ["stock_video"],
    });
    expect(() => stockCrossSearch.input.parse({ query: "", per_source: 2 })).toThrow();
    expect(() => stockCrossSearch.input.parse({ query: "moon", per_source: 0 })).toThrow();
  });
});
