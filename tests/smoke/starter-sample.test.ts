import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";
import { RenderReportSchema } from "../../src/artifacts/index.js";

let scratchDirs: string[] = [];
const execFileAsync = promisify(execFile);
const require = createRequire(import.meta.url);
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const cliPath = path.join(repoRoot, "src", "cli", "index.ts");
const tsxLoaderPath = require.resolve("tsx");

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("music-video starter sample", () => {
  it("runs the documented init, sample build, and export path with zero API keys", async () => {
    const root = path.join(tmpdir(), `predit-starter-sample-${randomUUID()}`);
    scratchDirs.push(root);
    await mkdir(root, { recursive: true });

    const initEvents = parseEvents(await runPredit(root, ["init", "--starter", "music-video"]));
    const buildEvents = parseEvents(await runPredit(root, ["build", "music-video/sample-episode", "--sample"]));
    expect(buildEvents).toEqual(
      expect.arrayContaining([expect.objectContaining({ event: "build_finished", status: "completed" })]),
    );

    const exportEvents = parseEvents(await runPredit(root, ["export", "music-video/sample-episode", "--target", "premiere"]));
    const events = [...initEvents, ...buildEvents, ...exportEvents];
    expect(events.map((event) => event.event)).not.toContain("registry_warnings");
    expect(exportEvents).toEqual(expect.arrayContaining([expect.objectContaining({ event: "exported" })]));

    const renderReportPath = path.join(root, "projects", "music-video", "sample-episode", "render_report.json");
    const renderReport = RenderReportSchema.parse(JSON.parse(await readFile(renderReportPath, "utf8")));
    const renderOutputPath = path.join(root, renderReport.output_path);
    expect(renderReport.output_path).toBe("projects/music-video/sample-episode/renders/sample-preview.mp4");
    expect(existsSync(renderOutputPath)).toBe(true);
    expect((await readFile(renderOutputPath)).subarray(4, 8).toString("ascii")).toBe("ftyp");
    expect(existsSync(path.join(root, "exports", "music-video__sample-episode.premiere", "timeline.xml"))).toBe(true);
  }, 60_000);
});

async function runPredit(cwd: string, args: string[]): Promise<string> {
  const result = await execFileAsync(process.execPath, ["--import", tsxLoaderPath, cliPath, "--json", ...args], {
    cwd,
    maxBuffer: 20 * 1024 * 1024,
    timeout: 45_000,
  });
  return result.stdout;
}

function parseEvents(stdout: string): Array<{ event: string; status?: string; package_path?: string }> {
  return stdout
    .trim()
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as { event: string; status?: string; package_path?: string });
}
