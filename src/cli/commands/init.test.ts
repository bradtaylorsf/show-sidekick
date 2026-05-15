import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Command } from "commander";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadShow } from "../../shows/load.js";
import { BUNDLED_CACHE_DIRS, computeBundledChecksum, copyBundledInto } from "../../version/bundled.js";
import { readCacheVersion } from "../../version/cache.js";
import { VERSION } from "../../version.js";
import { createInitHandler, type RunGit } from "./init.js";

let scratchDirs: string[] = [];

async function scratchDir(label: string): Promise<string> {
  const root = path.join(tmpdir(), `predit-init-${label}-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(root, { recursive: true });
  return root;
}

afterEach(async () => {
  vi.restoreAllMocks();
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("init command", () => {
  it("scaffolds the documented tree in an empty directory", async () => {
    const projectRoot = await scratchDir("project");
    const bundledRoot = await scratchDir("bundled");
    await writeFakeBundled(bundledRoot);
    const { io, output } = captureIo();

    await createInitHandler(io, {
      bundledRoot: () => bundledRoot,
      copyBundledInto: (target) => copyBundledInto(target, bundledRoot),
      computeBundledChecksum: () => computeBundledChecksum(bundledRoot),
      cwd: () => projectRoot,
      now: () => new Date("2026-05-14T12:00:00.000Z"),
    })(command({ json: true }));

    const event = JSON.parse(output().stdout.trim()) as { event: string; path: string; git: boolean };
    expect(event).toEqual({ event: "project_initialized", path: projectRoot, git: false });
    await expect(readFile(path.join(projectRoot, "CLAUDE.md"), "utf8")).resolves.toContain("AGENTS.md");
    await expect(readFile(path.join(projectRoot, "AGENTS.md"), "utf8")).resolves.toContain("user project");
    await expect(readFile(path.join(projectRoot, ".gitignore"), "utf8")).resolves.toContain(".predit/");
    await expect(stat(path.join(projectRoot, "shows"))).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    await expect(stat(path.join(projectRoot, "projects"))).resolves.toMatchObject({ isDirectory: expect.any(Function) });
    await expect(stat(path.join(projectRoot, "music_library"))).resolves.toMatchObject({
      isDirectory: expect.any(Function),
    });

    for (const dirname of BUNDLED_CACHE_DIRS) {
      await expect(readFile(path.join(projectRoot, ".predit", dirname, `${dirname}.txt`), "utf8")).resolves.toBe(
        `${dirname}\n`,
      );
    }

    await expect(readCacheVersion(projectRoot)).resolves.toEqual({
      harness_version: VERSION,
      bundled_checksum: await computeBundledChecksum(bundledRoot),
      locked_at: "2026-05-14T12:00:00.000Z",
    });
  });

  it("errors clearly when the directory is already initialized", async () => {
    const projectRoot = await scratchDir("project");
    const bundledRoot = await scratchDir("bundled");
    await writeFakeBundled(bundledRoot);
    await writeFile(path.join(projectRoot, "CLAUDE.md"), "# already here\n", "utf8");

    const { io } = captureIo();
    await expect(
      createInitHandler(io, { bundledRoot: () => bundledRoot, cwd: () => projectRoot })(command({})),
    ).rejects.toThrow("predit update");
  });

  it("runs git initialization commands in order when --git is set", async () => {
    const projectRoot = await scratchDir("project");
    const bundledRoot = await scratchDir("bundled");
    await writeFakeBundled(bundledRoot);
    const calls: string[][] = [];
    const runGit: RunGit = vi.fn(async (args) => {
      calls.push(args);
    });

    const { io } = captureIo();
    await createInitHandler(io, {
      bundledRoot: () => bundledRoot,
      copyBundledInto: (target) => copyBundledInto(target, bundledRoot),
      computeBundledChecksum: () => computeBundledChecksum(bundledRoot),
      cwd: () => projectRoot,
      runGit,
    })(command({ git: true }));

    expect(calls).toEqual([["init"], ["add", "."], ["commit", "-m", "Initial predit project scaffold."]]);
  });

  it("clones a requested starter and normalizes show.yaml to the starter slug", async () => {
    const projectRoot = await scratchDir("project");
    const bundledRoot = await scratchDir("bundled");
    await writeFakeBundled(bundledRoot);

    const { io, output } = captureIo();
    await createInitHandler(io, {
      bundledRoot: () => bundledRoot,
      copyBundledInto: (target) => copyBundledInto(target, bundledRoot),
      computeBundledChecksum: () => computeBundledChecksum(bundledRoot),
      cwd: () => projectRoot,
    })(command({ json: true, starter: "music-video" }));

    const event = JSON.parse(output().stdout.trim()) as { starter: string };
    expect(event.starter).toBe("music-video");
    await expect(loadShow(projectRoot, "music-video")).resolves.toMatchObject({
      slug: "music-video",
      pipelines: { cinematic: expect.any(Object) },
      defaults: { pipeline: "cinematic" },
    });
  });

  it("rejects unknown starters before writing the project", async () => {
    const projectRoot = await scratchDir("project");
    const bundledRoot = await scratchDir("bundled");
    await writeFakeBundled(bundledRoot);

    const { io } = captureIo();
    await expect(
      createInitHandler(io, { bundledRoot: () => bundledRoot, cwd: () => projectRoot })(
        command({ starter: "missing" }),
      ),
    ).rejects.toThrow("starter 'missing' not found");
    await expect(stat(path.join(projectRoot, ".predit"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects starters whose bundled pipeline binding is missing", async () => {
    const projectRoot = await scratchDir("project");
    const bundledRoot = await scratchDir("bundled");
    await writeFakeBundled(bundledRoot);
    const brokenStarterDir = path.join(bundledRoot, "starters", "broken-starter");
    await mkdir(brokenStarterDir, { recursive: true });
    await writeFile(
      path.join(brokenStarterDir, "show.yaml"),
      [
        "slug: broken-starter",
        'display_name: "Broken Starter"',
        "created: 2026-05-14",
        "pipelines:",
        "  undecided-pipeline:",
        "    playbook: clean-professional",
        "defaults:",
        "  pipeline: undecided-pipeline",
        "",
      ].join("\n"),
      "utf8",
    );

    const { io } = captureIo();
    await expect(
      createInitHandler(io, { bundledRoot: () => bundledRoot, cwd: () => projectRoot })(
        command({ starter: "broken-starter" }),
      ),
    ).rejects.toThrow("starter 'broken-starter' references bundled pipeline 'undecided-pipeline'");
    await expect(stat(path.join(projectRoot, ".predit"))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("rejects invalid starter slugs", async () => {
    const projectRoot = await scratchDir("project");
    const bundledRoot = await scratchDir("bundled");
    await writeFakeBundled(bundledRoot);

    const { io } = captureIo();
    await expect(
      createInitHandler(io, { bundledRoot: () => bundledRoot, cwd: () => projectRoot })(
        command({ starter: "../escape" }),
      ),
    ).rejects.toThrow("invalid starter slug");
  });
});

async function writeFakeBundled(root: string): Promise<void> {
  await mkdir(path.join(root, "templates", "user-project"), { recursive: true });
  await writeFile(path.join(root, "templates", "user-project", "CLAUDE.md"), "# test\nRead AGENTS.md\n", "utf8");
  await writeFile(path.join(root, "templates", "user-project", "AGENTS.md"), "# test user project\n", "utf8");
  await writeFile(path.join(root, "templates", "user-project", ".gitignore"), ".predit/\nprojects/\n", "utf8");

  for (const dirname of BUNDLED_CACHE_DIRS) {
    await mkdir(path.join(root, dirname), { recursive: true });
    await writeFile(path.join(root, dirname, `${dirname}.txt`), `${dirname}\n`, "utf8");
  }

  await writeFile(
    path.join(root, "pipelines", "cinematic.yaml"),
    [
      "slug: cinematic",
      "stages:",
      "  - slug: idea",
      "    skill: pipelines/cinematic/idea-director.md",
      "    produces: brief",
      "",
    ].join("\n"),
    "utf8",
  );

  const starterDir = path.join(root, "starters", "music-video");
  await mkdir(path.join(starterDir, "brand"), { recursive: true });
  await writeFile(
    path.join(starterDir, "show.yaml"),
    [
      "slug: starter-template",
      'display_name: "Starter Template"',
      "created: 2026-05-14",
      "brand: ./brand/",
      "pipelines:",
      "  cinematic:",
      "    playbook: moody-cinematic",
      "defaults:",
      "  pipeline: cinematic",
      "",
    ].join("\n"),
    "utf8",
  );
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
