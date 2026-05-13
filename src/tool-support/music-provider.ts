import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ToolContext } from "../registry/tool.js";
import {
  buildUrl,
  envValue,
  isRecord,
  numberField,
  stockVideoAttributionSchema,
  stringField,
} from "./stock-video.js";

export { buildUrl, envValue, isRecord, numberField, stringField };

export const musicQueryInputSchema = z.object({
  query: z.string().min(1),
  per_page: z.number().int().positive().default(5),
  min_duration: z.number().nonnegative().optional(),
  max_duration: z.number().positive().optional(),
  mood: z.string().min(1).optional(),
  bpm: z.number().positive().optional(),
  license: z.string().min(1).optional(),
});

export const musicMatchSchema = z.object({
  audio_url: z.string().url(),
  preview_url: z.string().url().optional(),
  duration: z.number().nonnegative().optional(),
  bpm: z.number().positive().optional(),
  attribution: stockVideoAttributionSchema,
});

export const musicProviderOutputSchema = z.object({
  matches: z.array(musicMatchSchema),
  cost_usd: z.number(),
});

export const musicGenInputSchema = z.object({
  prompt: z.string().min(1),
  duration: z.number().positive().optional(),
  mood: z.string().min(1).optional(),
  instruments: z.array(z.string().min(1)).optional(),
});

export const musicGenOutputSchema = z.object({
  audio_path: z.string().min(1),
  cost_usd: z.number(),
  provider_request_id: z.string().optional(),
});

export type MusicQueryInput = z.infer<typeof musicQueryInputSchema>;
export type MusicMatch = z.infer<typeof musicMatchSchema>;
export type MusicProviderOutput = z.infer<typeof musicProviderOutputSchema>;
export type MusicGenInput = z.infer<typeof musicGenInputSchema>;
export type MusicGenOutput = z.infer<typeof musicGenOutputSchema>;

export type FetchMusicSpec = {
  provider: string;
  url: string;
  headers?: Record<string, string>;
  input: MusicQueryInput;
  map(payload: unknown): MusicMatch[];
  costUsd?: number;
};

export type MusicGenerationPostSpec = {
  provider: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  costUsd: number;
  ctx: ToolContext;
  extension?: string;
};

export async function fetchMusic(spec: FetchMusicSpec): Promise<MusicProviderOutput> {
  const response = await fetch(spec.url, {
    method: "GET",
    headers: spec.headers,
  });

  if (!response.ok) {
    throw new Error(`${spec.provider} music request failed (${response.status}): ${await response.text()}`);
  }

  const payload: unknown = await response.json();

  return musicProviderOutputSchema.parse({
    matches: filterMusicMatches(spec.map(payload), spec.input),
    cost_usd: spec.costUsd ?? 0,
  });
}

export async function postMusicGeneration(spec: MusicGenerationPostSpec): Promise<MusicGenOutput> {
  const response = await fetch(spec.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...spec.headers,
    },
    body: JSON.stringify(spec.body),
  });

  if (!response.ok) {
    throw new Error(`${spec.provider} music generation request failed (${response.status}): ${await response.text()}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload: unknown = await response.json();
    const providerRequestId = findStringValue(payload, ["id", "request_id", "task_id", "generation_id"]);
    const audioPath = await resolveGeneratedMusicPath(payload, spec.ctx, spec.provider, providerRequestId, spec.extension ?? "mp3");

    return musicGenOutputSchema.parse({
      audio_path: audioPath,
      cost_usd: spec.costUsd,
      provider_request_id: providerRequestId,
    });
  }

  const providerRequestId = response.headers.get("x-request-id") ?? undefined;
  const audioPath = await writeMusicFile(
    spec.ctx,
    spec.provider,
    providerRequestId,
    spec.extension ?? "mp3",
    Buffer.from(await response.arrayBuffer()),
  );

  return musicGenOutputSchema.parse({
    audio_path: audioPath,
    cost_usd: spec.costUsd,
    provider_request_id: providerRequestId,
  });
}

function filterMusicMatches(matches: MusicMatch[], input: MusicQueryInput): MusicMatch[] {
  return matches
    .filter((match) => input.min_duration === undefined || (match.duration ?? 0) >= input.min_duration)
    .filter((match) => input.max_duration === undefined || match.duration === undefined || match.duration <= input.max_duration)
    .filter((match) => input.bpm === undefined || match.bpm === undefined || Math.abs(match.bpm - input.bpm) <= 8)
    .slice(0, input.per_page);
}

async function resolveGeneratedMusicPath(
  payload: unknown,
  ctx: ToolContext,
  provider: string,
  providerRequestId: string | undefined,
  extension: string,
): Promise<string> {
  const directPath = findStringValue(payload, ["audio_path", "path", "output_path"]);

  if (directPath) {
    return directPath;
  }

  const audioUrl = findStringValue(payload, ["audio_url", "url", "download_url"]);

  if (audioUrl) {
    return downloadMusic(audioUrl, ctx, provider, providerRequestId, extension);
  }

  const output = findOutputUrl(payload);

  if (output) {
    return downloadMusic(output, ctx, provider, providerRequestId, extension);
  }

  throw new Error(`${provider} music generation response did not include audio_path or audio_url`);
}

async function downloadMusic(
  audioUrl: string,
  ctx: ToolContext,
  provider: string,
  providerRequestId: string | undefined,
  extension: string,
): Promise<string> {
  const response = await fetch(audioUrl);

  if (!response.ok) {
    throw new Error(`${provider} music download failed (${response.status}): ${await response.text()}`);
  }

  return writeMusicFile(ctx, provider, providerRequestId, extension, Buffer.from(await response.arrayBuffer()));
}

async function writeMusicFile(
  ctx: ToolContext,
  provider: string,
  providerRequestId: string | undefined,
  extension: string,
  bytes: Buffer,
): Promise<string> {
  const outputDir = join(ctx.projectRoot, "projects", "_tool_runs", "music");
  await mkdir(outputDir, { recursive: true });
  const safeExtension = extension.replace(/^\./, "") || "mp3";
  const outputPath = join(outputDir, `${provider}-${providerRequestId ?? Date.now().toString()}.${safeExtension}`);
  await writeFile(outputPath, bytes);

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
