import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RenderReportSchema } from "../../src/artifacts/index.js";
import { createProgram } from "../../src/cli/program.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("music-video starter sample", () => {
  it("runs the documented init, sample build, and export path with zero API keys", async () => {
    const root = path.join(tmpdir(), `predit-starter-sample-${randomUUID()}`);
    scratchDirs.push(root);
    await mkdir(root, { recursive: true });
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "--json", "init", "--starter", "music-video"], { from: "node" });
    await program.parseAsync(["node", "predit", "--json", "build", "music-video/sample-episode", "--sample"], {
      from: "node",
    });
    await program.parseAsync(["node", "predit", "--json", "export", "music-video/sample-episode", "--target", "premiere"], {
      from: "node",
    });

    const events = output()
      .stdout.trim()
      .split("\n")
      .map((line) => JSON.parse(line) as { event: string; status?: string; package_path?: string });
    const lifecycleEvents = events.filter((event) => event.event === "build_finished" || event.event === "exported");
    expect(events.map((event) => event.event)).not.toContain("registry_warnings");
    expect(lifecycleEvents).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ event: "build_finished", status: "completed" }),
        expect.objectContaining({ event: "exported" }),
      ]),
    );

    const renderReportPath = path.join(root, "projects", "music-video", "sample-episode", "render_report.json");
    const renderReport = RenderReportSchema.parse(JSON.parse(await readFile(renderReportPath, "utf8")));
    const renderOutputPath = path.join(root, renderReport.output_path);
    expect(renderReport.output_path).toBe("projects/music-video/sample-episode/renders/sample-preview.mp4");
    expect(existsSync(renderOutputPath)).toBe(true);
    expect((await readFile(renderOutputPath)).subarray(4, 8).toString("ascii")).toBe("ftyp");
    expect(existsSync(path.join(root, "exports", "music-video__sample-episode.premiere", "timeline.xml"))).toBe(true);
  });
});

function captureProgram() {
  let stdout = "";
  let stderr = "";
  const program = createProgram({
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
  });

  return {
    program,
    output: () => ({ stdout, stderr }),
  };
}
