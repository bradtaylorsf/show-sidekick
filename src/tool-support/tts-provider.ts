import { mkdir, readFile, writeFile } from "node:fs/promises";
import { relative, resolve, join } from "node:path";
import { z } from "zod";
import type { ToolContext } from "../registry/tool.js";
import { envValue } from "./video-provider.js";

export { envValue };

export const ttsProviderInputSchema = z.object({
  text: z.string().min(1),
  voice_id: z.string().min(1).optional(),
  voice_name: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  format: z.string().min(1).optional(),
  model: z.string().min(1).optional(),
});

export const ttsProviderOutputSchema = z.object({
  audio_path: z.string().min(1),
  cost_usd: z.number(),
  provider_request_id: z.string().optional(),
  voice: z.string().optional(),
  model: z.string().optional(),
});

export type TtsProviderInput = z.infer<typeof ttsProviderInputSchema>;
export type TtsProviderOutput = z.infer<typeof ttsProviderOutputSchema>;

export type TtsPostSpec = {
  provider: string;
  url: string;
  headers: Record<string, string>;
  body: unknown;
  costUsd: number;
  ctx: ToolContext;
  extension?: string;
  voice?: string;
  model?: string;
};

export async function postTts(spec: TtsPostSpec): Promise<TtsProviderOutput> {
  const response = await fetch(spec.url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...spec.headers,
    },
    body: JSON.stringify(spec.body),
  });

  if (!response.ok) {
    throw new Error(`${spec.provider} TTS request failed (${response.status}): ${await response.text()}`);
  }

  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const payload: unknown = await response.json();
    const providerRequestId = findStringValue(payload, ["id", "request_id", "task_id", "prediction_id"]);
    const audioPath = await resolveAudioPath(payload, spec.ctx, spec.provider, providerRequestId, spec.extension ?? "mp3");

    return ttsProviderOutputSchema.parse({
      audio_path: audioPath,
      cost_usd: spec.costUsd,
      provider_request_id: providerRequestId,
      voice: spec.voice,
      model: spec.model,
    });
  }

  const providerRequestId = response.headers.get("x-request-id") ?? undefined;
  const audioPath = await writeTtsAudioFile(
    spec.ctx,
    spec.provider,
    providerRequestId,
    spec.extension ?? "mp3",
    Buffer.from(await response.arrayBuffer()),
  );

  return ttsProviderOutputSchema.parse({
    audio_path: audioPath,
    cost_usd: spec.costUsd,
    provider_request_id: providerRequestId,
    voice: spec.voice,
    model: spec.model,
  });
}

export async function writeTtsAudioFile(
  ctx: ToolContext,
  provider: string,
  providerRequestId: string | undefined,
  extension: string,
  bytes: Buffer,
): Promise<string> {
  const outputDir = join(ctx.projectRoot, "projects", "_tool_runs", "audio");
  await mkdir(outputDir, { recursive: true });
  const safeExtension = extension.replace(/^\./, "") || "mp3";
  const fileName = `${provider}-${providerRequestId ?? Date.now().toString()}.${safeExtension}`;
  const outputPath = join(outputDir, fileName);
  await writeFile(outputPath, bytes);

  return outputPath;
}

export async function resolveVoiceFromCharacter(characterName: string, ctx: ToolContext): Promise<string> {
  const charactersRoot = resolve(ctx.projectRoot, "characters");
  const voiceIdPath = resolve(charactersRoot, characterName, "voice_id.txt");

  if (!isInside(voiceIdPath, charactersRoot)) {
    throw new Error(`character voice name is outside characters/: ${characterName}`);
  }

  const voiceId = (await readFile(voiceIdPath, "utf8")).trim();

  if (voiceId.length === 0) {
    throw new Error(`character ${characterName} has an empty voice_id.txt`);
  }

  return voiceId;
}

async function resolveAudioPath(
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
    return downloadAudio(audioUrl, ctx, provider, providerRequestId, extension);
  }

  const output = findOutputUrl(payload);

  if (output) {
    return downloadAudio(output, ctx, provider, providerRequestId, extension);
  }

  throw new Error(`${provider} TTS response did not include audio_path or audio_url`);
}

async function downloadAudio(
  audioUrl: string,
  ctx: ToolContext,
  provider: string,
  providerRequestId: string | undefined,
  extension: string,
): Promise<string> {
  const response = await fetch(audioUrl);

  if (!response.ok) {
    throw new Error(`${provider} TTS download failed (${response.status}): ${await response.text()}`);
  }

  return writeTtsAudioFile(ctx, provider, providerRequestId, extension, Buffer.from(await response.arrayBuffer()));
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

function isInside(child: string, parent: string): boolean {
  const childRelative = relative(parent, child);
  return childRelative !== "" && !childRelative.startsWith("..") && !childRelative.startsWith("/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
