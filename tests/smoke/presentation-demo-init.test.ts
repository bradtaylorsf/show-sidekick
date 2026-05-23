import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { afterEach, describe, expect, it } from "vitest";
import { createInitHandler } from "../../src/cli/commands/init.js";
import { loadShow } from "../../src/shows/index.js";
import { bundledRoot, computeBundledChecksum, copyBundledInto } from "../../src/version/bundled.js";

let scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("presentation-demo starter init", () => {
  it("initializes the bundled starter with a resolvable presentation-demo pipeline and fixture deck", async () => {
    const projectRoot = await mkdtemp(path.join(tmpdir(), "predit-presentation-demo-init-"));
    scratchDirs.push(projectRoot);
    const sourceBundledRoot = bundledRoot();

    await createInitHandler(captureIo(), {
      bundledRoot: () => sourceBundledRoot,
      copyBundledInto: (target) => copyBundledInto(target, sourceBundledRoot),
      computeBundledChecksum: () => computeBundledChecksum(sourceBundledRoot),
      cwd: () => projectRoot,
      now: () => new Date("2026-05-22T12:00:00.000Z"),
      setupRuntimes: async () => undefined,
    })(command({ starter: "presentation-demo", setupRuntimes: false }));

    const show = await loadShow(projectRoot, "presentation-demo");
    expect(show.defaults.pipeline).toBe("presentation-demo");
    expect(show.pipelines["presentation-demo"]?.runtime).toBe("remotion");
    expect(existsSync(path.join(projectRoot, "shows", "presentation-demo", "inputs", "sample-episode", "deck.pdf"))).toBe(true);
    expect(existsSync(path.join(projectRoot, ".show-sidekick", "pipelines", "presentation-demo.yaml"))).toBe(true);
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
