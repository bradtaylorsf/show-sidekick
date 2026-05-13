import { writeFile } from "node:fs/promises";
import { generatedAssetPath } from "./generated-path.js";
import type { ToolContext } from "../registry/index.js";

export async function writeGeneratedImage(
  ctx: ToolContext,
  bytes: Uint8Array,
  options: { extension?: string } = {},
): Promise<string> {
  const outputPath = await generatedAssetPath(ctx, options);
  await writeFile(outputPath, bytes);

  return outputPath;
}

export function decodeBase64Image(value: string): Buffer {
  const base64 = value.includes(",") ? value.slice(value.indexOf(",") + 1) : value;
  return Buffer.from(base64, "base64");
}

export async function responseBytes(response: Response, label: string): Promise<Buffer> {
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
  }

  return Buffer.from(await response.arrayBuffer());
}

export async function responseJson<T>(response: Response, label: string): Promise<T> {
  if (!response.ok) {
    throw new Error(`${label} failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()) as T;
}

export function definedEntries(input: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(input).filter((entry): entry is [string, unknown] => entry[1] !== undefined));
}
