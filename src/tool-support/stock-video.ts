import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { ToolContext } from "../registry/tool.js";
import { envValue } from "./video-provider.js";

export { envValue };

export const stockVideoInputSchema = z.object({
  query: z.string().min(1),
  per_page: z.number().int().positive().default(5),
  aspect_ratio: z.string().min(1).optional(),
  min_duration: z.number().nonnegative().optional(),
});

export const stockVideoAttributionSchema = z.object({
  source: z.string().min(1),
  author: z.string().min(1).optional(),
  source_url: z.string().url().optional(),
  license: z.string().min(1),
});

export const stockVideoMatchSchema = z.object({
  video_url: z.string().url(),
  thumbnail_url: z.string().url().optional(),
  duration: z.number().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  attribution: stockVideoAttributionSchema,
});

export const stockVideoOutputSchema = z.object({
  matches: z.array(stockVideoMatchSchema),
  cost_usd: z.number(),
});

export const stockImageMatchSchema = z.object({
  image_url: z.string().url(),
  thumbnail_url: z.string().url().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  attribution: stockVideoAttributionSchema,
});

export const stockImageOutputSchema = z.object({
  matches: z.array(stockImageMatchSchema),
  cost_usd: z.number(),
});

export type StockVideoInput = z.infer<typeof stockVideoInputSchema>;
export type StockVideoMatch = z.infer<typeof stockVideoMatchSchema>;
export type StockVideoOutput = z.infer<typeof stockVideoOutputSchema>;
export type StockImageMatch = z.infer<typeof stockImageMatchSchema>;
export type StockImageOutput = z.infer<typeof stockImageOutputSchema>;

export type FetchStockVideoSpec = {
  provider: string;
  url: string;
  headers?: Record<string, string>;
  input: StockVideoInput;
  map(payload: unknown): StockVideoMatch[];
  costUsd?: number;
};

export type ManifestStockVideoSpec = {
  provider: string;
  feedUrl: string;
  input: StockVideoInput;
  ctx: ToolContext;
  license: string;
};

export type FetchStockImageSpec = {
  provider: string;
  url: string;
  headers?: Record<string, string>;
  input: StockVideoInput;
  map(payload: unknown): StockImageMatch[];
  costUsd?: number;
};

export async function fetchStockVideo(spec: FetchStockVideoSpec): Promise<StockVideoOutput> {
  const response = await fetch(spec.url, {
    method: "GET",
    headers: spec.headers,
  });

  if (!response.ok) {
    throw new Error(`${spec.provider} stock video request failed (${response.status}): ${await response.text()}`);
  }

  const payload: unknown = await response.json();

  return stockVideoOutputSchema.parse({
    matches: filterStockVideoMatches(spec.map(payload), spec.input),
    cost_usd: spec.costUsd ?? 0,
  });
}

export async function fetchStockImage(spec: FetchStockImageSpec): Promise<StockImageOutput> {
  const response = await fetch(spec.url, {
    method: "GET",
    headers: spec.headers,
  });

  if (!response.ok) {
    throw new Error(`${spec.provider} stock image request failed (${response.status}): ${await response.text()}`);
  }

  const payload: unknown = await response.json();

  return stockImageOutputSchema.parse({
    matches: spec.map(payload).slice(0, spec.input.per_page),
    cost_usd: spec.costUsd ?? 0,
  });
}

export async function searchStockVideoManifest(spec: ManifestStockVideoSpec): Promise<StockVideoOutput> {
  const payload = await readManifest(spec.feedUrl, spec.ctx, spec.provider);
  const matches = manifestItems(payload)
    .filter((item) => manifestItemMatchesQuery(item, spec.input.query))
    .map((item) => manifestItemToVideoMatch(item, spec.provider, spec.license))
    .filter((match): match is StockVideoMatch => match !== undefined);

  return stockVideoOutputSchema.parse({
    matches: filterStockVideoMatches(matches, spec.input),
    cost_usd: 0,
  });
}

export function buildUrl(baseUrl: string, params: Record<string, string | number | undefined>): string {
  const url = new URL(baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  return url.toString();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function stringField(record: Record<string, unknown>, ...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "string" && value.length > 0) {
      return value;
    }
  }

  return undefined;
}

export function numberField(record: Record<string, unknown>, ...keys: string[]): number | undefined {
  for (const key of keys) {
    const value = record[key];

    if (typeof value === "number" && Number.isFinite(value)) {
      return value;
    }

    if (typeof value === "string" && value.trim() !== "") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) {
        return parsed;
      }
    }
  }

  return undefined;
}

export function recordField(record: Record<string, unknown>, ...keys: string[]): Record<string, unknown> | undefined {
  for (const key of keys) {
    const value = record[key];

    if (isRecord(value)) {
      return value;
    }
  }

  return undefined;
}

export function recordArrayField(record: Record<string, unknown>, ...keys: string[]): Record<string, unknown>[] {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [];
}

export function stringArrayField(record: Record<string, unknown>, ...keys: string[]): string[] {
  for (const key of keys) {
    const value = record[key];

    if (Array.isArray(value)) {
      return value.filter((item): item is string => typeof item === "string" && item.length > 0);
    }
  }

  return [];
}

function filterStockVideoMatches(matches: StockVideoMatch[], input: StockVideoInput): StockVideoMatch[] {
  return matches
    .filter((match) => input.min_duration === undefined || (match.duration ?? 0) >= input.min_duration)
    .filter((match) => input.aspect_ratio === undefined || matchesAspectRatio(match, input.aspect_ratio))
    .slice(0, input.per_page);
}

function matchesAspectRatio(match: StockVideoMatch, requested: string): boolean {
  if (match.width === undefined || match.height === undefined) {
    return true;
  }

  const expected = parseAspectRatio(requested);
  if (expected === undefined) {
    return true;
  }

  const actual = match.width / match.height;
  return Math.abs(actual - expected) <= 0.08;
}

function parseAspectRatio(value: string): number | undefined {
  const [left, right] = value.split(":").map((part) => Number(part));

  if (left && right && Number.isFinite(left) && Number.isFinite(right) && right !== 0) {
    return left / right;
  }

  return undefined;
}

async function readManifest(feedUrl: string, ctx: ToolContext, provider: string): Promise<unknown> {
  if (feedUrl.startsWith("http://") || feedUrl.startsWith("https://")) {
    const response = await fetch(feedUrl);

    if (!response.ok) {
      throw new Error(`${provider} stock video request failed (${response.status}): ${await response.text()}`);
    }

    return response.json() as Promise<unknown>;
  }

  const path = isAbsolute(feedUrl) ? feedUrl : resolve(ctx.projectRoot, feedUrl);
  return JSON.parse(await readFile(path, "utf8")) as unknown;
}

function manifestItems(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["clips", "videos", "items", "results", "matches"]) {
    const value = payload[key];

    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [];
}

function manifestItemMatchesQuery(item: Record<string, unknown>, query: string): boolean {
  const normalizedQuery = query.trim().toLowerCase();
  const searchable = [
    stringField(item, "title", "name", "description"),
    tagsText(item.tags),
    tagsText(item.keywords),
  ]
    .filter((value): value is string => value !== undefined)
    .join(" ")
    .toLowerCase();

  if (searchable.includes(normalizedQuery)) {
    return true;
  }

  return normalizedQuery
    .split(/\s+/)
    .filter((term) => term.length > 0)
    .some((term) => searchable.includes(term));
}

function tagsText(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string").join(" ");
  }

  return typeof value === "string" ? value : undefined;
}

function manifestItemToVideoMatch(
  item: Record<string, unknown>,
  provider: string,
  defaultLicense: string,
): StockVideoMatch | undefined {
  const videoUrl = stringField(item, "video_url", "download_url", "file_url", "mp4_url", "url");

  if (!videoUrl) {
    return undefined;
  }

  return {
    video_url: videoUrl,
    thumbnail_url: stringField(item, "thumbnail_url", "thumbnail", "poster_url", "image_url"),
    duration: numberField(item, "duration", "duration_seconds"),
    width: numberField(item, "width"),
    height: numberField(item, "height"),
    attribution: {
      source: provider,
      author: stringField(item, "author", "creator", "user", "credit"),
      source_url: stringField(item, "source_url", "page_url", "web_url"),
      license: stringField(item, "license") ?? defaultLicense,
    },
  };
}
