import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { writeCheckpoint, writeState, type Checkpoint } from "../../checkpoints/index.js";
import { recordCost } from "../../cost/tracker.js";
import { createProgram } from "../program.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-status-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  await writeShow(root, "show", "music-video");
  await writeEpisode(root, "show", "episode", "music-video");
  return root;
}

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("status command", () => {
  it("emits episode status as NDJSON with cost aggregation and last decision", async () => {
    const root = await scratchProject();
    await writeRuntimeState(root);
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "status", "show/episode"], { from: "node" });

    const row = JSON.parse(output().stdout.trim()) as {
      event: string;
      target: string;
      cost: { sample_total: number; full_total: number; total_so_far_usd: number };
      last_decision: { stage: string; decision: string };
      state: { current_stage: string; last_status: string };
    };

    expect(row).toEqual(
      expect.objectContaining({
        event: "episode_status",
        target: "show/episode",
        cost: {
          sample_total: 0.4,
          full_total: 1.2,
          total_so_far_usd: 1.6,
        },
        last_decision: {
          stage: "script",
          decision: "pass",
        },
      }),
    );
    expect(row.state).toEqual(expect.objectContaining({ current_stage: "script", last_status: "awaiting_human" }));
  });

  it("prints a human-readable status block", async () => {
    const root = await scratchProject();
    await writeRuntimeState(root);
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "status", "show/episode"], { from: "node" });

    expect(output().stdout).toContain("status: show/episode");
    expect(output().stdout).toContain("state: current_stage=script last_status=awaiting_human");
    expect(output().stdout).toContain("cost: sample $0.40, full $1.20, total $1.60");
    expect(output().stdout).toContain("last decision: script -> pass");
  });
});

async function writeRuntimeState(root: string): Promise<void> {
  await writeState(root, "show", "episode", {
    show: "show",
    episode: "episode",
    pipeline: "music-video",
    current_stage: "script",
    last_status: "awaiting_human",
    last_checkpoint_at: "2026-05-12T16:00:00Z",
  });
  await recordCost(root, "show", "episode", {
    tool: "image_generation",
    provider: "test-provider",
    model: "sample-model",
    units: 1,
    usd: 0.4,
    mode: "sample",
  });
  await recordCost(root, "show", "episode", {
    tool: "image_generation",
    provider: "test-provider",
    model: "full-model",
    units: 2,
    usd: 1.2,
    mode: "full",
  });
  await writeCheckpoint(root, "show", "episode", "idea", checkpoint("idea", "revise", "2026-05-12T15:00:00Z"));
  await writeCheckpoint(root, "show", "episode", "script", checkpoint("script", "pass", "2026-05-12T16:00:00Z"));
}

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

function checkpoint(stage: string, decision: string, timestamp: string): Checkpoint {
  return {
    stage,
    status: "awaiting_human",
    timestamp,
    artifact: { ok: true },
    review_summary: {
      decision,
      rounds: 1,
      critical: 0,
      suggestions: 0,
      nitpicks: 0,
      findings: [],
    },
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
