import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { BRANDING, LEGACY_BRANDING } from "../branding.js";
import { compareVersions, readCacheVersion, versionFile, writeCacheVersion } from "./cache.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-cache-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, BRANDING.cacheDir), { recursive: true });
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("cache version metadata", () => {
  it("round-trips public cache version metadata", async () => {
    const root = await scratchProject();

    await writeCacheVersion(root, {
      harness_version: "1.2.3",
      bundled_checksum: "abc123",
      locked_at: "2026-05-14T00:00:00.000Z",
    });

    await expect(readCacheVersion(root)).resolves.toEqual({
      harness_version: "1.2.3",
      bundled_checksum: "abc123",
      locked_at: "2026-05-14T00:00:00.000Z",
    });
  });

  it("reads legacy cache version metadata before migration", async () => {
    const root = path.join(tmpdir(), `predit-cache-${randomUUID()}`);
    scratchDirs.push(root);
    await mkdir(path.join(root, LEGACY_BRANDING.cacheDir), { recursive: true });
    await writeFile(
      path.join(root, LEGACY_BRANDING.cacheDir, BRANDING.cacheVersionFileName),
      `${JSON.stringify({
        harness_version: "1.2.3",
        bundled_checksum: "legacy",
        locked_at: "2026-05-14T00:00:00.000Z",
      })}\n`,
      "utf8",
    );

    await expect(readCacheVersion(root)).resolves.toMatchObject({ bundled_checksum: "legacy" });
  });

  it("exposes the public version file path", async () => {
    const root = await scratchProject();

    expect(versionFile(root)).toBe(path.join(root, BRANDING.cacheDir, BRANDING.cacheVersionFileName));
  });

  it("returns null when version.json is missing", async () => {
    const root = await scratchProject();

    await expect(readCacheVersion(root)).resolves.toBeNull();
  });
});

describe("compareVersions", () => {
  it("returns match for exact versions", () => {
    expect(compareVersions("1.2.3", "1.2.3")).toBe("match");
  });

  it("returns mismatch for minor or patch differences within the same major", () => {
    expect(compareVersions("1.2.3", "1.2.4")).toBe("mismatch");
    expect(compareVersions("1.2.3", { harness_version: "1.3.0" })).toBe("mismatch");
  });

  it("returns incompatible for major-version differences", () => {
    expect(compareVersions("2.0.0", "1.9.9")).toBe("incompatible");
    expect(compareVersions("0.1.0", "1.0.0")).toBe("incompatible");
  });
});
