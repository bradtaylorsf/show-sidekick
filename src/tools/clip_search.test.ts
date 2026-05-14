import { mkdir, mkdtemp, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import type { Tool, ToolContext } from "../registry/tool.js";
import clipSearch from "./clip_search.js";

function noopLogger(): ToolContext["logger"] {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

function context(projectRoot: string, registry: ToolContext["registry"]): ToolContext {
  return { projectRoot, logger: noopLogger(), registry };
}

describe("clip_search tool", () => {
  it("returns top-k clips ranked by deterministic CLIP-style similarity and caches clip embeddings", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-search-"));
    const corpusDir = join(projectRoot, "corpus");
    await mkdir(corpusDir, { recursive: true });
    const calm = join(corpusDir, "calm.mp4");
    const fast = join(corpusDir, "fast.mp4");
    const neutral = join(corpusDir, "neutral.mov");
    await writeFile(calm, "calm");
    await writeFile(fast, "fast");
    await writeFile(neutral, "neutral");
    await writeFile(join(corpusDir, "notes.txt"), "ignore");

    const execute = vi.fn(async (params: unknown) => {
      if (isRecord(params) && typeof params.text === "string") {
        return { vector: [1, 0], model_id: "mock-clip" };
      }

      if (isRecord(params) && typeof params.path === "string" && params.path.endsWith("calm.mp4")) {
        return { vector: [0.95, 0.05], model_id: "mock-clip" };
      }

      if (isRecord(params) && typeof params.path === "string" && params.path.endsWith("neutral.mov")) {
        return { vector: [0.5, 0.5], model_id: "mock-clip" };
      }

      return { vector: [0.05, 0.95], model_id: "mock-clip" };
    });
    const embedder = { execute } as unknown as Tool;
    const registry = { select: vi.fn(async () => embedder) };

    const result = await clipSearch.execute(
      clipSearch.input.parse({ query: "quiet establishing shot", corpus_dir: corpusDir, top_k: 2 }),
      context(projectRoot, registry),
    );

    expect(registry.select).toHaveBeenCalledWith("clip_embedding");
    expect(result.matches.map((match) => match.video_path)).toEqual([calm, neutral]);
    expect(result.matches[0]?.score).toBeGreaterThan(result.matches[1]?.score ?? 0);
    await expect(stat(join(corpusDir, "calm.mock-clip.embedding.json"))).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  it("throws a clear error when clip_embedder is not available", async () => {
    await expect(
      clipSearch.execute(
        clipSearch.input.parse({ query: "anything", corpus_dir: "/tmp/corpus" }),
        { projectRoot: "/tmp/project", logger: noopLogger() },
      ),
    ).rejects.toThrow("clip_embedding capability required (S-2)");
  });

  it("does not reuse cached vectors across model ids", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-search-real-"));
    const corpusDir = join(projectRoot, "corpus");
    await mkdir(corpusDir, { recursive: true });
    const city = join(corpusDir, "city-skyline.mp4");
    const forest = join(corpusDir, "quiet-forest.mp4");
    await writeFile(city, "city skyline timelapse traffic");
    await writeFile(forest, "quiet forest trees");
    const execute = vi
      .fn()
      .mockResolvedValueOnce({ vector: [1, 0], model_id: "model-a" })
      .mockResolvedValueOnce({ vector: [1, 0], model_id: "model-a" })
      .mockResolvedValueOnce({ vector: [0, 1], model_id: "model-a" })
      .mockResolvedValueOnce({ vector: [0, 1], model_id: "model-b" })
      .mockResolvedValueOnce({ vector: [0, 1], model_id: "model-b" })
      .mockResolvedValueOnce({ vector: [1, 0], model_id: "model-b" });
    const embedder = { execute } as unknown as Tool;
    const registry = { select: vi.fn(async () => embedder) };

    await clipSearch.execute(
      clipSearch.input.parse({ query: "city skyline", corpus_dir: corpusDir, top_k: 1 }),
      context(projectRoot, registry),
    );
    await clipSearch.execute(clipSearch.input.parse({ query: "forest", corpus_dir: corpusDir, top_k: 1 }), context(projectRoot, registry));

    await expect(stat(join(corpusDir, "city-skyline.model-a.embedding.json"))).resolves.toMatchObject({
      isFile: expect.any(Function),
    });
    await expect(stat(join(corpusDir, "city-skyline.model-b.embedding.json"))).resolves.toMatchObject({
      isFile: expect.any(Function),
    });
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
