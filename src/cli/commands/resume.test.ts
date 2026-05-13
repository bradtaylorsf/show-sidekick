import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeCheckpoint, type Checkpoint } from "../../checkpoints/index.js";
import { createProgram } from "../program.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-resume-command-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  await writePipeline(root, "music-video");
  await writeShow(root, "show", "music-video");
  await writeEpisode(root, "show", "episode", "music-video");
  return root;
}

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("resume command", () => {
  it("emits the next stage from the resume protocol", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "idea", checkpoint("idea", "completed"));
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "resume", "show/episode"], { from: "node" });

    const event = JSON.parse(output().stdout.trim()) as { event: string; kind: string; stage: string };
    expect(event).toEqual(
      expect.objectContaining({
        event: "resume_next",
        kind: "run",
        stage: "script",
      }),
    );
  });

  it("emits done when all pipeline stages are complete", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "script", checkpoint("script", "completed"));
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "resume", "show/episode"], { from: "node" });

    const event = JSON.parse(output().stdout.trim()) as { event: string; kind: string; stage?: string };
    expect(event).toEqual(
      expect.objectContaining({
        event: "resume_next",
        kind: "done",
      }),
    );
    expect(event.stage).toBeUndefined();
  });
});

async function writeShow(root: string, slug: string, pipeline: string): Promise<void> {
  const showDir = path.join(root, "shows", slug);
  await mkdir(path.join(showDir, "episodes"), { recursive: true });
  await writeFile(
    path.join(showDir, "show.yaml"),
    [
      `slug: ${slug}`,
      'display_name: "Test Show"',
      "created: 2026-05-12",
      "pipelines:",
      `  ${pipeline}: {}`,
      "defaults:",
      `  pipeline: ${pipeline}`,
      "",
    ].join("\n"),
    "utf8",
  );
}

async function writeEpisode(root: string, show: string, slug: string, pipeline: string): Promise<void> {
  await writeFile(
    path.join(root, "shows", show, "episodes", `${slug}.yaml`),
    [`slug: ${slug}`, 'title: "Episode"', "created: 2026-05-12", `pipeline: ${pipeline}`, ""].join("\n"),
    "utf8",
  );
}

async function writePipeline(root: string, slug: string): Promise<void> {
  await writeFile(
    path.join(root, ".predit", "pipelines", `${slug}.yaml`),
    [
      `slug: ${slug}`,
      "stages:",
      "  - slug: idea",
      "    skill: pipelines/music-video/idea-director.md",
      "    produces: brief",
      "  - slug: script",
      "    skill: pipelines/music-video/script-director.md",
      "    produces: script",
      "",
    ].join("\n"),
    "utf8",
  );
}

function checkpoint(stage: string, status: "completed" | "awaiting_human"): Checkpoint {
  return {
    stage,
    status,
    timestamp: "2026-05-12T15:42:00Z",
    artifact: { ok: true },
    tool_invocations: [],
  };
}

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
