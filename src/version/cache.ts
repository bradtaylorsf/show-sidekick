import { readFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { atomicWrite } from "../checkpoints/io.js";

type ErrorWithCode = Error & { code?: string };

export const CacheVersionSchema = z.object({
  harness_version: z.string().min(1),
  bundled_checksum: z.string().min(1),
  locked_at: z.string().min(1),
});

export type CacheVersion = z.infer<typeof CacheVersionSchema>;

export type VersionComparison = "match" | "mismatch" | "incompatible";

export async function readCacheVersion(projectRoot: string): Promise<CacheVersion | null> {
  const filePath = versionFile(projectRoot);
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return null;
    }
    throw error;
  }

  return CacheVersionSchema.parse(JSON.parse(raw));
}

export async function writeCacheVersion(projectRoot: string, payload: CacheVersion): Promise<void> {
  const parsed = CacheVersionSchema.parse(payload);
  await atomicWrite(versionFile(projectRoot), `${JSON.stringify(parsed, null, 2)}\n`);
}

export function compareVersions(
  installed: string,
  cached: string | Pick<CacheVersion, "harness_version"> | null,
): VersionComparison {
  if (cached === null) {
    return "mismatch";
  }

  const cachedVersion = typeof cached === "string" ? cached : cached.harness_version;
  if (installed === cachedVersion) {
    return "match";
  }

  const installedMajor = majorVersion(installed);
  const cachedMajor = majorVersion(cachedVersion);
  if (installedMajor !== null && cachedMajor !== null && installedMajor !== cachedMajor) {
    return "incompatible";
  }

  return "mismatch";
}

function versionFile(projectRoot: string): string {
  return path.join(projectRoot, ".predit", "version.json");
}

function majorVersion(version: string): number | null {
  const normalized = version.startsWith("v") ? version.slice(1) : version;
  const [major] = normalized.split(".");
  if (!major || !/^\d+$/u.test(major)) {
    return null;
  }
  return Number(major);
}
