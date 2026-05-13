import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, isAbsolute, join, parse, resolve } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import type { Tool, ToolContext } from "../registry/tool.js";

const inputSchema = z.object({
  query: z.string().min(1),
  corpus_dir: z.string().min(1),
  top_k: z.number().int().positive().default(5),
});

const outputSchema = z.object({
  matches: z.array(z.object({ video_path: z.string(), score: z.number() })),
  cost_usd: z.number(),
});

export default defineTool({
  name: "clip_search",
  capability: "clip_search",
  provider: "local",
  status: "beta",
  integration: { kind: "library", package: "node:fs", install: "built into Node.js" },
  best_for: "Semantic search over a local corpus of generated clips using a CLIP embedder tool.",
  supports: ["clip-embedding-search", "generated-clip-corpus"],
  cost: { unit: "call", usd: 0 },
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const embedder = await selectClipEmbedder(ctx);
    const queryEmbedding = readEmbedding(await embedder.execute({ text: input.query }, ctx));
    const corpusDir = resolveProjectPath(input.corpus_dir, ctx.projectRoot);
    const videoPaths = await listVideoFiles(corpusDir);
    const matches = await Promise.all(
      videoPaths.map(async (videoPath) => {
        const embedding = await readOrCreateClipEmbedding(videoPath, embedder, ctx);
        return { video_path: videoPath, score: cosineSimilarity(queryEmbedding, embedding) };
      }),
    );

    return outputSchema.parse({
      matches: matches.sort((left, right) => right.score - left.score).slice(0, input.top_k),
      cost_usd: 0,
    });
  },
});

async function selectClipEmbedder(ctx: ToolContext): Promise<Tool> {
  if (!ctx.registry) {
    throw new Error("clip_embedder capability required (S-2)");
  }

  try {
    return await ctx.registry.select("clip_embedder");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`clip_embedder capability required (S-2): ${message}`);
  }
}

async function readOrCreateClipEmbedding(videoPath: string, embedder: Tool, ctx: ToolContext): Promise<number[]> {
  const embeddingPath = clipEmbeddingPath(videoPath);

  try {
    return readEmbedding(JSON.parse(await readFile(embeddingPath, "utf8")));
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const embedding = readEmbedding(await embedder.execute({ video_path: videoPath }, ctx));
  await writeFile(embeddingPath, `${JSON.stringify({ embedding })}\n`);
  return embedding;
}

function readEmbedding(output: unknown): number[] {
  if (Array.isArray(output) && output.every((value) => typeof value === "number")) {
    return output;
  }

  if (isRecord(output)) {
    if (Array.isArray(output.embedding) && output.embedding.every((value) => typeof value === "number")) {
      return output.embedding;
    }

    if (Array.isArray(output.vector) && output.vector.every((value) => typeof value === "number")) {
      return output.vector;
    }
  }

  throw new Error("clip_embedder did not return a numeric embedding");
}

function clipEmbeddingPath(videoPath: string): string {
  const parsed = parse(videoPath);
  return join(parsed.dir, `${parsed.name}.embedding.json`);
}

async function listVideoFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }

      if (entry.isFile() && isVideoFile(path)) {
        files.push(path);
      }
    }
  }

  await walk(root);
  return files.sort((left, right) => basename(left).localeCompare(basename(right)));
}

function isVideoFile(path: string): boolean {
  return [".mp4", ".mov", ".mkv", ".webm"].includes(extname(path).toLowerCase());
}

function cosineSimilarity(left: number[], right: number[]): number {
  if (left.length !== right.length) {
    throw new Error("clip embeddings must have matching dimensions");
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    dot += leftValue * rightValue;
    leftMagnitude += leftValue * leftValue;
    rightMagnitude += rightValue * rightValue;
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function resolveProjectPath(path: string, projectRoot: string): string {
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
