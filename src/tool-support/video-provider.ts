import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ToolContext } from "../registry/tool.js";
import { lookupClipCache, rememberClipCache } from "./clip-cache.js";

export const videoProviderInputSchema = z.object({
  prompt: z.string().min(1),
  image_url: z.string().url().optional(),
  duration: z.number().int().positive().optional(),
  aspect_ratio: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

export const videoProviderOutputSchema = z.object({
  video_path: z.string().min(1),
  cost_usd: z.number(),
  provider_request_id: z.string().optional(),
});

export type VideoProviderInput = z.infer<typeof videoProviderInputSchema>;
export type VideoProviderOutput = z.infer<typeof videoProviderOutputSchema>;

export type JsonPostSpec = {
  provider: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  costUsd: number;
  ctx: ToolContext;
  prompt?: string;
  model?: string;
  image_url?: string;
  duration?: number;
  aspect_ratio?: string;
};

export async function postVideoGeneration(spec: JsonPostSpec): Promise<VideoProviderOutput> {
  const cacheKey = spec.prompt
    ? {
        prompt: spec.prompt,
        provider: spec.provider,
        model: spec.model ?? inferModel(spec.body) ?? "default",
        image_url: spec.image_url ?? inferString(spec.body, ["image_url", "image", "promptImage", "first_frame_image"]),
        duration: spec.duration ?? inferNumber(spec.body, ["duration", "durationSeconds"]),
        aspect_ratio: spec.aspect_ratio ?? inferString(spec.body, ["aspect_ratio", "aspectRatio", "ratio"]),
      }
    : undefined;
  const cached = cacheKey ? await lookupClipCache(spec.ctx, cacheKey) : undefined;
  if (cached) {
    return videoProviderOutputSchema.parse({
      video_path: cached.video_path,
      cost_usd: 0,
      provider_request_id: `clip_cache:${cached.cache_key}`,
    });
  }

  const response = await fetch(spec.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...spec.headers,
    },
    body: JSON.stringify(spec.body),
  });

  if (!response.ok) {
    throw new Error(`${spec.provider} video request failed (${response.status}): ${await response.text()}`);
  }

  const payload: unknown = await response.json();
  const providerRequestId = findStringValue(payload, ["id", "request_id", "task_id", "prediction_id"]);
  const videoPath = await resolveVideoPath(payload, spec.ctx, spec.provider, providerRequestId);

  const output = videoProviderOutputSchema.parse({
    video_path: videoPath,
    cost_usd: spec.costUsd,
    provider_request_id: providerRequestId,
  });

  if (cacheKey) {
    await rememberClipCache(spec.ctx, { ...cacheKey, video_path: output.video_path });
  }

  return output;
}

export function envValue(name: string): string {
  const value = process.env[name];
  if (value === undefined || value.trim() === "") {
    throw new Error(`missing env: ${name}`);
  }

  return value;
}

async function resolveVideoPath(
  payload: unknown,
  ctx: ToolContext,
  provider: string,
  providerRequestId: string | undefined,
): Promise<string> {
  const directPath = findStringValue(payload, ["video_path", "path", "output_path"]);

  if (directPath) {
    return directPath;
  }

  const videoUrl = findStringValue(payload, ["video_url", "url", "download_url"]);

  if (videoUrl) {
    return downloadVideo(videoUrl, ctx, provider, providerRequestId);
  }

  const output = findOutputUrl(payload);

  if (output) {
    return downloadVideo(output, ctx, provider, providerRequestId);
  }

  throw new Error(`${provider} video response did not include video_path or video_url`);
}

async function downloadVideo(
  videoUrl: string,
  ctx: ToolContext,
  provider: string,
  providerRequestId: string | undefined,
): Promise<string> {
  const response = await fetch(videoUrl);

  if (!response.ok) {
    throw new Error(`${provider} video download failed (${response.status}): ${await response.text()}`);
  }

  const outputDir = join(ctx.projectRoot, "projects", "_tool_runs", "video");
  await mkdir(outputDir, { recursive: true });
  const fileName = `${provider}-${providerRequestId ?? Date.now().toString()}.mp4`;
  const outputPath = join(outputDir, fileName);
  await writeFile(outputPath, Buffer.from(await response.arrayBuffer()));

  return outputPath;
}

function findStringValue(payload: unknown, keys: string[]): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  for (const value of Object.values(payload)) {
    const nested = findStringValue(value, keys);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function findOutputUrl(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  const output = payload.output;

  if (typeof output === "string" && output.length > 0) {
    return output;
  }

  if (Array.isArray(output)) {
    const first = output.find((value): value is string => typeof value === "string" && value.length > 0);
    if (first) {
      return first;
    }
  }

  for (const value of Object.values(payload)) {
    const nested = findOutputUrl(value);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function inferModel(payload: unknown): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  for (const key of ["model", "model_id", "modelId", "variant"]) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  for (const value of Object.values(payload)) {
    const nested = inferModel(value);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function inferString(payload: unknown, keys: string[]): string | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  for (const value of Object.values(payload)) {
    const nested = inferString(value, keys);
    if (nested) {
      return nested;
    }
  }

  return undefined;
}

function inferNumber(payload: unknown, keys: string[]): number | undefined {
  if (!isRecord(payload)) {
    return undefined;
  }

  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }
  }

  for (const value of Object.values(payload)) {
    const nested = inferNumber(value, keys);
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
