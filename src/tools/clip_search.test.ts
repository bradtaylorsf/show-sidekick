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
        return { embedding: [1, 0] };
      }

      if (isRecord(params) && typeof params.video_path === "string" && params.video_path.endsWith("calm.mp4")) {
        return { embedding: [0.95, 0.05] };
      }

      if (isRecord(params) && typeof params.video_path === "string" && params.video_path.endsWith("neutral.mov")) {
        return { embedding: [0.5, 0.5] };
      }

      return { embedding: [0.05, 0.95] };
    });
    const embedder = { execute } as unknown as Tool;
    const registry = { select: vi.fn(async () => embedder) };

    const result = await clipSearch.execute(
      clipSearch.input.parse({ query: "quiet establishing shot", corpus_dir: corpusDir, top_k: 2 }),
      context(projectRoot, registry),
    );

    expect(registry.select).toHaveBeenCalledWith("clip_embedder");
    expect(result.matches.map((match) => match.video_path)).toEqual([calm, neutral]);
    expect(result.matches[0]?.score).toBeGreaterThan(result.matches[1]?.score ?? 0);
    await expect(stat(join(corpusDir, "calm.embedding.json"))).resolves.toMatchObject({ isFile: expect.any(Function) });
  });

  it("throws a clear error when clip_embedder is not available", async () => {
    await expect(
      clipSearch.execute(
        clipSearch.input.parse({ query: "anything", corpus_dir: "/tmp/corpus" }),
        { projectRoot: "/tmp/project", logger: noopLogger() },
      ),
    ).rejects.toThrow("clip_embedder capability required (S-2)");
  });
});

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
