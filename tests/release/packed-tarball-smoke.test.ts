import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const runPackedSmoke = process.env.SHOW_SIDEKICK_PACKED_TARBALL_SMOKE === "1";
const describePackedSmoke = runPackedSmoke ? describe : describe.skip;
const scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs.length = 0;
});

describePackedSmoke("packed tarball smoke", () => {
  it(
    "installs the packed tarball globally and runs init, cache restore, build, and export",
    async () => {
      const root = path.join(tmpdir(), `show-sidekick-pack-smoke-${randomUUID()}`);
      scratchDirs.push(root);
      const packDir = path.join(root, "pack");
      const prefix = path.join(root, "global");
      const npmCache = path.join(root, "npm-cache");
      const projectRoot = path.join(root, "project");
      await mkdir(packDir, { recursive: true });
      await mkdir(projectRoot, { recursive: true });

      const tarballPath = await packTarball(packDir);
      await execFileAsync("npm", ["install", "-g", tarballPath, "--prefix", prefix, "--cache", npmCache], {
        cwd: root,
        maxBuffer: 20 * 1024 * 1024,
        timeout: 90_000,
      });

      const showkickBin = showkickBinPath(prefix);
      expect(existsSync(showkickBin)).toBe(true);

      await runShowkick(showkickBin, projectRoot, ["--json", "init", "--starter", "animated-explainer", "--no-setup-runtimes"]);
      const cacheDir = path.join(projectRoot, ".show-sidekick");
      const cacheVersionPath = path.join(cacheDir, "version.json");
      expect(existsSync(cacheVersionPath)).toBe(true);

      await rm(cacheDir, { recursive: true, force: true });
      expect(existsSync(cacheVersionPath)).toBe(false);

      await runShowkick(showkickBin, projectRoot, [
        "--json",
        "build",
        "animated-explainer/sample-episode",
        "--sample",
        "--non-interactive",
      ]);
      expect(existsSync(cacheVersionPath)).toBe(true);
      expect(existsSync(path.join(cacheDir, "pipelines", "animated-explainer.yaml"))).toBe(true);

      const cacheVersion = JSON.parse(await readFile(cacheVersionPath, "utf8")) as { harness_version?: unknown };
      expect(cacheVersion.harness_version).toBeDefined();

      await runShowkick(showkickBin, projectRoot, [
        "--json",
        "export",
        "animated-explainer/sample-episode",
        "--target",
        "premiere",
      ]);
      expect(existsSync(path.join(projectRoot, "exports", "animated-explainer__sample-episode.premiere"))).toBe(true);
    },
    180_000,
  );
});

async function packTarball(packDir: string): Promise<string> {
  await execFileAsync("npm", ["pack", "--pack-destination", packDir, "--ignore-scripts"], {
    cwd: repoRoot,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 90_000,
  });

  const tarballs = (await readdir(packDir)).filter((file) => file.endsWith(".tgz"));
  expect(tarballs).toHaveLength(1);
  return path.join(packDir, tarballs[0] as string);
}

async function runShowkick(showkickBin: string, cwd: string, args: readonly string[]): Promise<string> {
  const result = await execFileAsync(showkickBin, [...args], {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 90_000,
  });
  return result.stdout;
}

function showkickBinPath(prefix: string): string {
  if (process.platform === "win32") {
    return path.join(prefix, "showkick.cmd");
  }

  return path.join(prefix, "bin", "showkick");
}
