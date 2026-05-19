import { rm } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { BRANDING } from "../../branding.js";
import { findProjectRoot, publicCacheDir } from "../../paths/project.js";
import { BUNDLED_CACHE_DIRS, bundledRoot, computeBundledChecksum, copyBundledInto, syncAgentSkillMirrors } from "../../version/bundled.js";
import { compareVersions, readCacheVersion, writeCacheVersion, type VersionComparison } from "../../version/cache.js";
import { VERSION } from "../../version.js";
import type { CacheVersion } from "../../version/cache.js";
import type { CliIo, GlobalOptions } from "./stub.js";

type UpdateOptions = GlobalOptions & {
  check?: boolean;
};

type UpdateDeps = {
  findProjectRoot?: typeof findProjectRoot;
  copyBundledInto?: (targetPreditDir: string) => Promise<void>;
  computeBundledChecksum?: () => Promise<string>;
  readCacheVersion?: typeof readCacheVersion;
  writeCacheVersion?: typeof writeCacheVersion;
  now?: () => Date;
};

type CacheUpdatedEvent = {
  event: "cache_updated";
  harness_version: string;
  bundled_checksum: string;
  path: string;
};

type CacheCheckedEvent = {
  event: "cache_checked";
  status: VersionComparison;
  harness_version: string;
  cached_harness_version?: string;
  bundled_checksum: string;
  cached_bundled_checksum?: string;
  path: string;
};

export function createUpdateHandler(io: CliIo, deps: UpdateDeps = {}) {
  return async (...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<UpdateOptions>();
    const projectRoot = (deps.findProjectRoot ?? findProjectRoot)();
    const sourceBundledRoot = bundledRoot();
    const computeChecksum = deps.computeBundledChecksum ?? (() => computeBundledChecksum(sourceBundledRoot));

    if (options.check) {
      const bundledChecksum = await computeChecksum();
      const cached = await (deps.readCacheVersion ?? readCacheVersion)(projectRoot);
      const status = cacheStatus(cached, bundledChecksum);
      emitCheck(io, options, {
        event: "cache_checked",
        status,
        harness_version: VERSION,
        cached_harness_version: cached?.harness_version,
        bundled_checksum: bundledChecksum,
        cached_bundled_checksum: cached?.bundled_checksum,
        path: publicCacheDir(projectRoot),
      });
      if (status !== "match") {
        process.exitCode = 1;
      }
      return;
    }

    const cacheDir = publicCacheDir(projectRoot);
    for (const dirname of BUNDLED_CACHE_DIRS) {
      await rm(path.join(cacheDir, dirname), { recursive: true, force: true });
    }

    const copyCache = deps.copyBundledInto ?? ((targetPreditDir: string) => copyBundledInto(targetPreditDir, sourceBundledRoot));
    await copyCache(cacheDir);
    await syncAgentSkillMirrors(projectRoot);

    const bundledChecksum = await computeChecksum();
    await (deps.writeCacheVersion ?? writeCacheVersion)(projectRoot, {
      harness_version: VERSION,
      bundled_checksum: bundledChecksum,
      locked_at: (deps.now ?? (() => new Date()))().toISOString(),
    });

    emitUpdated(io, options, {
      event: "cache_updated",
      harness_version: VERSION,
      bundled_checksum: bundledChecksum,
      path: cacheDir,
    });
  };
}

function cacheStatus(cached: CacheVersion | null, bundledChecksum: string): VersionComparison {
  const versionStatus = compareVersions(VERSION, cached);
  if (versionStatus !== "match") {
    return versionStatus;
  }

  return cached?.bundled_checksum === bundledChecksum ? "match" : "mismatch";
}

function emitUpdated(io: CliIo, options: UpdateOptions, event: CacheUpdatedEvent): void {
  if (options.json) {
    io.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }

  io.stdout.write(`update: refreshed ${event.path} for ${BRANDING.packageName} v${event.harness_version}\n`);
}

function emitCheck(io: CliIo, options: UpdateOptions, event: CacheCheckedEvent): void {
  if (options.json) {
    io.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }

  if (event.status === "match") {
    io.stdout.write(`update: ${event.path} is current for ${BRANDING.packageName} v${event.harness_version}\n`);
    return;
  }

  io.stdout.write(`update: ${event.path} is stale; run '${BRANDING.primaryCli} update'\n`);
}
