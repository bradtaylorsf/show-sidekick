import { createHash } from "node:crypto";
import { copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";

type CacheEntry = {
  video_path: string;
  prompt: string;
  provider: string;
  model: string;
  cached_at: string;
};

type CacheIndex = Record<string, CacheEntry>;

const inputSchema = z
  .object({
    mode: z.enum(["lookup", "store"]),
    prompt: z.string().min(1),
    provider: z.string().min(1),
    model: z.string().min(1),
    video_path: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (value.mode === "store" && !value.video_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["video_path"],
        message: "video_path is required when storing a clip",
      });
    }
  });

const outputSchema = z.object({
  hit: z.boolean(),
  video_path: z.string().optional(),
  cache_key: z.string(),
});

export default defineTool({
  name: "clip_cache",
  capability: "clip_cache",
  provider: "local",
  status: "beta",
  integration: { kind: "library", package: "node:crypto", install: "built into Node.js" },
  best_for: "Caching generated clips by prompt, provider, and model to avoid duplicate provider calls.",
  supports: ["generated-clip-cache", "prompt-provider-model-key"],
  cost: { unit: "call", usd: 0 },
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const cacheDir = join(ctx.projectRoot, "projects", "_tool_runs", "clip_cache");
    const indexPath = join(cacheDir, "index.json");
    const key = cacheKey(input.prompt, input.provider, input.model);
    await mkdir(cacheDir, { recursive: true });
    const index = await readIndex(indexPath);

    if (input.mode === "lookup") {
      const entry = index[key];
      return outputSchema.parse({
        hit: entry !== undefined,
        video_path: entry?.video_path,
        cache_key: key,
      });
    }

    const sourcePath = resolveProjectPath(input.video_path ?? "", ctx.projectRoot);
    const cachedPath = join(cacheDir, `${key}.mp4`);
    await copyFile(sourcePath, cachedPath);

    index[key] = {
      video_path: cachedPath,
      prompt: input.prompt,
      provider: input.provider,
      model: input.model,
      cached_at: new Date().toISOString(),
    };
    await writeIndex(indexPath, index);

    return outputSchema.parse({
      hit: true,
      video_path: cachedPath,
      cache_key: key,
    });
  },
});

function cacheKey(prompt: string, provider: string, model: string): string {
  return createHash("sha256").update(`${prompt}|${provider}|${model}`).digest("hex").slice(0, 16);
}

async function readIndex(indexPath: string): Promise<CacheIndex> {
  try {
    const parsed: unknown = JSON.parse(await readFile(indexPath, "utf8"));
    return isCacheIndex(parsed) ? parsed : {};
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeIndex(indexPath: string, index: CacheIndex): Promise<void> {
  const tmpPath = `${indexPath}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(index, null, 2)}\n`);
  await rename(tmpPath, indexPath);
}

function resolveProjectPath(path: string, projectRoot: string): string {
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

function isCacheIndex(value: unknown): value is CacheIndex {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  return Object.values(value).every((entry) => {
    return (
      typeof entry === "object" &&
      entry !== null &&
      !Array.isArray(entry) &&
      typeof (entry as CacheEntry).video_path === "string" &&
      typeof (entry as CacheEntry).prompt === "string" &&
      typeof (entry as CacheEntry).provider === "string" &&
      typeof (entry as CacheEntry).model === "string" &&
      typeof (entry as CacheEntry).cached_at === "string"
    );
  });
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
