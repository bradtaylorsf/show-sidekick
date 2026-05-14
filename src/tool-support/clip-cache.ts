import { createHash, randomUUID } from "node:crypto";
import { access, copyFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { extname, isAbsolute, join, resolve } from "node:path";
import type { ToolContext } from "../registry/tool.js";

export type ClipCacheKeyInput = {
  prompt: string;
  provider: string;
  model: string;
  image_url?: string;
  duration?: number;
  aspect_ratio?: string;
};

export type ClipCacheStoreInput = ClipCacheKeyInput & {
  video_path: string;
};

export type ClipCacheEntry = ClipCacheStoreInput & {
  cached_at: string;
};

type CacheIndex = Record<string, ClipCacheEntry>;

export function clipCacheKey(input: ClipCacheKeyInput): string {
  return createHash("sha256").update(stableStringify(normalizeCacheKey(input))).digest("hex").slice(0, 16);
}

export async function lookupClipCache(
  ctx: ToolContext,
  input: ClipCacheKeyInput,
): Promise<{ video_path: string; cache_key: string } | undefined> {
  const key = clipCacheKey(input);

  try {
    const index = await readIndex(indexPath(ctx.projectRoot));
    const entry = index[key];
    return entry ? { video_path: entry.video_path, cache_key: key } : undefined;
  } catch (error) {
    ctx.logger.warn("clip cache lookup skipped", { error: errorMessage(error) });
    return undefined;
  }
}

export async function rememberClipCache(
  ctx: ToolContext,
  input: ClipCacheStoreInput,
): Promise<{ video_path: string; cache_key: string } | undefined> {
  const key = clipCacheKey(input);

  try {
    const dir = cacheDir(ctx.projectRoot);
    const indexFile = indexPath(ctx.projectRoot);
    await mkdir(dir, { recursive: true });
    const index = await readIndex(indexFile);
    const videoPath = await cacheVideoFile(dir, key, input.video_path, ctx.projectRoot);

    index[key] = {
      ...input,
      video_path: videoPath,
      cached_at: new Date().toISOString(),
    };
    await writeIndex(indexFile, index);

    return { video_path: videoPath, cache_key: key };
  } catch (error) {
    ctx.logger.warn("clip cache store skipped", { error: errorMessage(error) });
    return undefined;
  }
}

export function clipCachePaths(projectRoot: string): { dir: string; index: string } {
  return { dir: cacheDir(projectRoot), index: indexPath(projectRoot) };
}

async function cacheVideoFile(dir: string, key: string, videoPath: string, projectRoot: string): Promise<string> {
  const resolved = isAbsolute(videoPath) ? videoPath : resolve(projectRoot, videoPath);

  try {
    await access(resolved);
  } catch {
    return videoPath;
  }

  const extension = extname(resolved) || ".mp4";
  const cachedPath = join(dir, `${key}${extension}`);
  await copyFile(resolved, cachedPath);
  return cachedPath;
}

async function readIndex(path: string): Promise<CacheIndex> {
  try {
    const parsed: unknown = JSON.parse(await readFile(path, "utf8"));
    return isCacheIndex(parsed) ? parsed : {};
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return {};
    }

    throw error;
  }
}

async function writeIndex(path: string, index: CacheIndex): Promise<void> {
  const tmpPath = `${path}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(tmpPath, `${JSON.stringify(index, null, 2)}\n`);
  await rename(tmpPath, path);
}

function cacheDir(projectRoot: string): string {
  return join(projectRoot, "projects", "_tool_runs", "clip_cache");
}

function indexPath(projectRoot: string): string {
  return join(cacheDir(projectRoot), "index.json");
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
      typeof (entry as ClipCacheEntry).video_path === "string" &&
      typeof (entry as ClipCacheEntry).prompt === "string" &&
      typeof (entry as ClipCacheEntry).provider === "string" &&
      typeof (entry as ClipCacheEntry).model === "string" &&
      typeof (entry as ClipCacheEntry).cached_at === "string"
    );
  });
}

function normalizeCacheKey(input: ClipCacheKeyInput): ClipCacheKeyInput {
  return {
    prompt: input.prompt,
    provider: input.provider,
    model: input.model,
    ...(input.image_url !== undefined ? { image_url: input.image_url } : {}),
    ...(input.duration !== undefined ? { duration: input.duration } : {}),
    ...(input.aspect_ratio !== undefined ? { aspect_ratio: input.aspect_ratio } : {}),
  };
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }

  if (typeof value === "object" && value !== null) {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify((value as Record<string, unknown>)[key])}`)
      .join(",")}}`;
  }

  return JSON.stringify(value) ?? "undefined";
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
