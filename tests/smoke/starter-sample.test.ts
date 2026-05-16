import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
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

    const initEvents = parseEvents(await runPredit(root, ["init", "--starter", "music-video", "--no-setup-runtimes"]));
    await writeFile(
      path.join(root, "shows", "music-video", "inputs", "sample-episode", "lyrics.txt"),
      [
        "Codex teammate: turn the demo folder into a sharp first reel.",
        "Idea 1: show the CLI setup and what is ready.",
        "Idea 2: compare two richer video directions.",
        "Next: add paid tools when the sample feels right.",
      ].join("\n"),
      "utf8",
    );
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
    expect(renderReport.asset_count).toBeGreaterThan(1);
    expect(renderReport.clip_trims?.every((trim) => trim.drift_frames <= 1)).toBe(true);
    expect(renderReport.validation_steps).toEqual(
      expect.arrayContaining([expect.objectContaining({ name: "render_drift", status: "pass" })]),
    );
    expect(existsSync(path.join(root, "projects", "music-video", "sample-episode", "audio_energy.json"))).toBe(true);
    const lyricsAligned = JSON.parse(
      await readFile(path.join(root, "projects", "music-video", "sample-episode", "lyrics_aligned.json"), "utf8"),
    ) as { lines: Array<{ id: string; start_ms: number; end_ms: number; source: string }> };
    expect(lyricsAligned.lines.every((line) => line.source === "manual" && line.end_ms > line.start_ms)).toBe(true);
    const scenePlan = JSON.parse(
      await readFile(path.join(root, "projects", "music-video", "sample-episode", "scene_plan.json"), "utf8"),
    ) as { scenes: Array<{ timing_anchor?: string; timing_ref?: { lyric_line_id?: string } }> };
    expect(scenePlan.scenes.every((scene) => scene.timing_anchor && scene.timing_ref?.lyric_line_id)).toBe(true);
    const assetManifest = JSON.parse(
      await readFile(path.join(root, "projects", "music-video", "sample-episode", "asset_manifest.json"), "utf8"),
    ) as { assets: Array<{ id: string; path: string; prompt: string }> };
    expect(assetManifest.assets.map((asset) => asset.id)).toEqual([
      "sample_card_1",
      "sample_card_2",
      "sample_card_3",
      "sample_card_4",
    ]);
    expect(assetManifest.assets.every((asset) => existsSync(path.join(root, asset.path)))).toBe(true);
    expect(assetManifest.assets[0]?.prompt).toContain("idea card");
    expect(assetManifest.assets[0]?.prompt).toContain("Codex teammate");
    const editDecisions = JSON.parse(
      await readFile(path.join(root, "projects", "music-video", "sample-episode", "edit_decisions.json"), "utf8"),
    ) as { cuts: Array<{ asset_id: string; timing_anchor?: string; timing_ref?: { lyric_line_id?: string } }> };
    expect(new Set(editDecisions.cuts.map((cut) => cut.asset_id)).size).toBeGreaterThan(1);
    expect(editDecisions.cuts.every((cut) => cut.timing_anchor && cut.timing_ref?.lyric_line_id)).toBe(true);
    expect(JSON.parse(await readFile(path.join(root, "projects", "music-video", "sample-episode", "cost_log.json"), "utf8"))).toEqual(
      expect.arrayContaining([expect.objectContaining({ tool: "starter_sample", usd: 0, mode: "sample" })]),
    );
    expect(JSON.parse(await readFile(path.join(root, "projects", "music-video", "sample-episode", "decisions.json"), "utf8"))).toEqual(
      expect.arrayContaining([expect.objectContaining({ category: "render_runtime_selection", picked: "ffmpeg" })]),
    );
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
