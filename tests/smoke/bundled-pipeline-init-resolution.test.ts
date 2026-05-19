import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { BRANDING } from "../../src/branding.js";
import { createInitHandler } from "../../src/cli/commands/init.js";
import { BUNDLED_MANIFEST_INVENTORY_SLUGS } from "../../src/pipelines/demo-inventory.js";
import { bundledRoot, computeBundledChecksum, copyBundledInto } from "../../src/version/bundled.js";

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("bundled pipeline init resolution", () => {
  it("caches every bundled pipeline manifest and skill set during init", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "predit-bundled-init-"));
    scratchDirs.push(projectRoot);
    const sourceBundledRoot = bundledRoot();

    await createInitHandler(captureIo(), {
      bundledRoot: () => sourceBundledRoot,
      copyBundledInto: (target) => copyBundledInto(target, sourceBundledRoot),
      computeBundledChecksum: () => computeBundledChecksum(sourceBundledRoot),
      cwd: () => projectRoot,
      now: () => new Date("2026-05-14T12:00:00.000Z"),
      setupRuntimes: async () => undefined,
    })(command({ setupRuntimes: false }));

    for (const slug of BUNDLED_MANIFEST_INVENTORY_SLUGS) {
      expect(existsSync(path.join(projectRoot, BRANDING.cacheDir, "pipelines", `${slug}.yaml`)), slug).toBe(true);
      expect(existsSync(path.join(projectRoot, BRANDING.cacheDir, "skills", "pipelines", slug)), slug).toBe(true);
    }
  });
});

function captureIo() {
  return {
    stdout: { write: () => true },
    stderr: { write: () => true },
  };
}

function command(options: Record<string, unknown>): Command {
  return {
    optsWithGlobals: () => options,
  } as unknown as Command;
}
