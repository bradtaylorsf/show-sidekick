import { readdir, readFile, writeFile } from "node:fs/promises";
import { basename, extname, join, parse } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import type { Tool, ToolContext } from "../registry/tool.js";
import { resolveProjectPath } from "../tool-support/paths.js";

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
    const queryEmbedding = readEmbeddingWithModel(await embedder.execute({ text: input.query, modality: "text" }, ctx));
    const corpusDir = resolveProjectPath(input.corpus_dir, ctx.projectRoot);
    const videoPaths = await listVideoFiles(corpusDir);
    const matches = await Promise.all(
      videoPaths.map(async (videoPath) => {
        const embedding = await readOrCreateClipEmbedding(videoPath, embedder, ctx, queryEmbedding.modelId);
        return { video_path: videoPath, score: cosineSimilarity(queryEmbedding.vector, embedding) };
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
    throw new Error("clip_embedding capability required (S-2)");
  }

  try {
    return await ctx.registry.select("clip_embedding");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`clip_embedding capability required (S-2): ${message}`);
  }
}

async function readOrCreateClipEmbedding(
  videoPath: string,
  embedder: Tool,
  ctx: ToolContext,
  modelId: string,
): Promise<number[]> {
  const embeddingPath = clipEmbeddingPath(videoPath, modelId);

  try {
    const cached = readEmbeddingWithModel(JSON.parse(await readFile(embeddingPath, "utf8")));
    if (cached.modelId === modelId) {
      return cached.vector;
    }
  } catch (error) {
    if (!isNodeError(error) || error.code !== "ENOENT") {
      throw error;
    }
  }

  const embedding = readEmbeddingWithModel(await embedder.execute({ path: videoPath, modality: "frame" }, ctx));
  if (embedding.modelId !== modelId) {
    throw new Error(`clip_embedding model mismatch: query used ${modelId}, video used ${embedding.modelId}`);
  }

  await writeFile(embeddingPath, `${JSON.stringify({ model_id: modelId, vector: embedding.vector })}\n`);
  return embedding.vector;
}

function readEmbeddingWithModel(output: unknown): { vector: number[]; modelId: string } {
  if (Array.isArray(output) && output.every((value) => typeof value === "number")) {
    return { vector: output, modelId: "unknown" };
  }

  if (isRecord(output)) {
    if (Array.isArray(output.embedding) && output.embedding.every((value) => typeof value === "number")) {
      return { vector: output.embedding, modelId: readModelId(output) };
    }

    if (Array.isArray(output.vector) && output.vector.every((value) => typeof value === "number")) {
      return { vector: output.vector, modelId: readModelId(output) };
    }
  }

  throw new Error("clip_embedding did not return a numeric embedding");
}

function clipEmbeddingPath(videoPath: string, modelId: string): string {
  const parsed = parse(videoPath);
  return join(parsed.dir, `${parsed.name}.${safeModelId(modelId)}.embedding.json`);
}

function readModelId(output: Record<string, unknown>): string {
  return typeof output.model_id === "string" && output.model_id.length > 0 ? output.model_id : "unknown";
}

function safeModelId(modelId: string): string {
  return modelId.replace(/[^a-zA-Z0-9._-]+/g, "_") || "unknown";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
