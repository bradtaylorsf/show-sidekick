import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";

const DIMENSIONS = 32;

const inputSchema = z
  .object({
    text: z.string().min(1).optional(),
    video_path: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.text && !value.video_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "clip_embedder requires text or video_path",
      });
    }
  });

const outputSchema = z.object({
  embedding: z.array(z.number()).length(DIMENSIONS),
  cost_usd: z.number(),
});

export default defineTool({
  name: "clip_embedder",
  capability: "clip_embedder",
  provider: "local",
  status: "experimental",
  integration: { kind: "library", package: "node:crypto", install: "built into Node.js" },
  best_for: "Deterministic local clip/text embeddings for fixture-scale clip search when a full CLIP backend is not configured.",
  supports: ["clip-search-fixtures", "deterministic-embeddings"],
  cost: { unit: "call", usd: 0 },
  input: inputSchema,
  output: outputSchema,
  async execute(params) {
    const input = inputSchema.parse(params);
    const text = input.text ?? (input.video_path ? await videoEmbeddingText(input.video_path) : "");

    return outputSchema.parse({
      embedding: embedText(text),
      cost_usd: 0,
    });
  },
});

async function videoEmbeddingText(videoPath: string): Promise<string> {
  try {
    const bytes = await readFile(videoPath);
    return `${basename(videoPath)} ${bytes.toString("utf8", 0, Math.min(bytes.length, 4096))}`;
  } catch {
    return basename(videoPath);
  }
}

function embedText(text: string): number[] {
  const vector = Array.from({ length: DIMENSIONS }, () => 0);
  const tokens = text.toLowerCase().split(/[^a-z0-9]+/u).filter(Boolean);

  for (const token of tokens.length > 0 ? tokens : [text]) {
    const hash = createHash("sha256").update(token).digest();
    const index = hash[0] % DIMENSIONS;
    const sign = hash[1] % 2 === 0 ? 1 : -1;
    vector[index] += sign;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));
  if (magnitude === 0) {
    return vector;
  }

  return vector.map((value) => Number((value / magnitude).toFixed(8)));
}
