import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { ProjectRootNotFoundError } from "../../paths/errors.js";
import { BUNDLED_CACHE_DIRS, computeBundledChecksum, copyBundledInto } from "../../version/bundled.js";
import { readCacheVersion, writeCacheVersion } from "../../version/cache.js";
import { VERSION } from "../../version.js";
import { createUpdateHandler } from "./update.js";

let scratchDirs: string[] = [];
let originalExitCode: string | number | undefined;

async function scratchDir(label: string): Promise<string> {
  const root = path.join(tmpdir(), `predit-update-${label}-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

afterEach(async () => {
  process.exitCode = originalExitCode;
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("update command", () => {
  it("refreshes the cache and writes version metadata", async () => {
    originalExitCode = process.exitCode;
    const projectRoot = await scratchProject();
    const bundledRoot = await scratchDir("bundled");
    await writeFakeBundled(bundledRoot, "fresh");
    await writeFile(path.join(projectRoot, ".predit", "pipelines", "old.yaml"), "old\n", "utf8");
    await writeFile(path.join(projectRoot, ".predit", "local-note.txt"), "keep\n", "utf8");
    const { io, output } = captureIo();

    await createUpdateHandler(io, {
      findProjectRoot: () => projectRoot,
      copyBundledInto: (target) => copyBundledInto(target, bundledRoot),
      computeBundledChecksum: () => computeBundledChecksum(bundledRoot),
      now: () => new Date("2026-05-14T12:30:00.000Z"),
    })(command({ json: true }));

    const event = JSON.parse(output().stdout.trim()) as { event: string; bundled_checksum: string };
    expect(event).toEqual(
      expect.objectContaining({
        event: "cache_updated",
        harness_version: VERSION,
        bundled_checksum: await computeBundledChecksum(bundledRoot),
      }),
    );
    await expect(stat(path.join(projectRoot, ".predit", "pipelines", "old.yaml"))).rejects.toMatchObject({
      code: "ENOENT",
    });
    await expect(readFile(path.join(projectRoot, ".predit", "pipelines", "fresh.txt"), "utf8")).resolves.toBe(
      "fresh\n",
    );
    await expect(readFile(path.join(projectRoot, ".predit", "local-note.txt"), "utf8")).resolves.toBe("keep\n");
    await expect(readCacheVersion(projectRoot)).resolves.toEqual({
      harness_version: VERSION,
      bundled_checksum: await computeBundledChecksum(bundledRoot),
      locked_at: "2026-05-14T12:30:00.000Z",
    });
  });

  it("--check is read-only and exits non-zero when the cache is stale", async () => {
    originalExitCode = process.exitCode;
    const projectRoot = await scratchProject();
    const bundledRoot = await scratchDir("bundled");
    await writeFakeBundled(bundledRoot, "fresh");
    await writeCacheVersion(projectRoot, {
      harness_version: VERSION,
      bundled_checksum: "stale",
      locked_at: "2026-05-14T12:00:00.000Z",
    });
    await writeFile(path.join(projectRoot, ".predit", "pipelines", "old.yaml"), "old\n", "utf8");
    const { io, output } = captureIo();

    await createUpdateHandler(io, {
      findProjectRoot: () => projectRoot,
      copyBundledInto: (target) => copyBundledInto(target, bundledRoot),
      computeBundledChecksum: () => computeBundledChecksum(bundledRoot),
    })(command({ json: true, check: true }));

    const event = JSON.parse(output().stdout.trim()) as { event: string; status: string };
    expect(event).toEqual(expect.objectContaining({ event: "cache_checked", status: "mismatch" }));
    expect(process.exitCode).toBe(1);
    await expect(readFile(path.join(projectRoot, ".predit", "pipelines", "old.yaml"), "utf8")).resolves.toBe("old\n");
  });

  it("--check exits cleanly when version and checksum match", async () => {
    originalExitCode = process.exitCode;
    process.exitCode = undefined;
    const projectRoot = await scratchProject();
    const bundledRoot = await scratchDir("bundled");
    await writeFakeBundled(bundledRoot, "fresh");
    await writeCacheVersion(projectRoot, {
      harness_version: VERSION,
      bundled_checksum: await computeBundledChecksum(bundledRoot),
      locked_at: "2026-05-14T12:00:00.000Z",
    });
    const { io, output } = captureIo();

    await createUpdateHandler(io, {
      findProjectRoot: () => projectRoot,
      computeBundledChecksum: () => computeBundledChecksum(bundledRoot),
    })(command({ check: true }));

    expect(output().stdout).toContain("is current");
    expect(process.exitCode).toBeUndefined();
  });

  it("errors when run outside a predit project", async () => {
    originalExitCode = process.exitCode;
    const root = await scratchDir("outside");
    const { io } = captureIo();

    await expect(
      createUpdateHandler(io, {
        findProjectRoot: () => {
          throw new ProjectRootNotFoundError(root);
        },
      })(command({})),
    ).rejects.toThrow(ProjectRootNotFoundError);
  });
});

async function scratchProject(): Promise<string> {
  const root = await scratchDir("project");
  await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  return root;
}

async function writeFakeBundled(root: string, marker: string): Promise<void> {
  for (const dirname of BUNDLED_CACHE_DIRS) {
    await mkdir(path.join(root, dirname), { recursive: true });
  }
  await writeFile(path.join(root, "pipelines", `${marker}.txt`), `${marker}\n`, "utf8");
  await writeFile(path.join(root, "playbooks", "look.yaml"), "slug: look\n", "utf8");
  await writeFile(path.join(root, "skills", "skill.md"), "# skill\n", "utf8");
  await writeFile(path.join(root, "schemas", "schema.json"), "{}\n", "utf8");
  await writeFile(path.join(root, "starters", "README.md"), "starters\n", "utf8");
}

function captureIo() {
  let stdout = "";
  let stderr = "";

  return {
    io: {
      stdout: {
        write: (value: string) => {
          stdout += value;
          return true;
        },
      },
      stderr: {
        write: (value: string) => {
          stderr += value;
          return true;
        },
      },
    },
    output: () => ({ stdout, stderr }),
  };
}

function command(options: Record<string, unknown>): Command {
  return {
    optsWithGlobals: () => options,
  } as unknown as Command;
}
