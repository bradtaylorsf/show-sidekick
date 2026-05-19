import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { publicCacheDir } from "../paths/project.js";
import type { ToolContext } from "../registry/index.js";

export async function generatedAssetPath(ctx: ToolContext, options: { extension?: string } = {}): Promise<string> {
  const extension = sanitizeExtension(options.extension ?? "png");
  const outputDir = join(publicCacheDir(ctx.projectRoot), "cache", "images");

  await mkdir(outputDir, { recursive: true });

  return join(outputDir, `${randomUUID()}.${extension}`);
}

function sanitizeExtension(extension: string): string {
  const normalized = extension.replace(/^\./, "").toLowerCase();

  if (!/^[a-z0-9]+$/.test(normalized)) {
    throw new Error(`invalid image extension: ${extension}`);
  }

  return normalized;
}
