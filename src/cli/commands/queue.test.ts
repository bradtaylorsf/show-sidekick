import { createHash, randomUUID } from "node:crypto";
import { access, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { listCheckpoints, readState, writeCheckpoint, type Checkpoint } from "../../checkpoints/index.js";
import { checkpointDir } from "../../checkpoints/paths.js";
import { recordDecision } from "../../decisions/store.js";
import { createProgram } from "../program.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();
const CUT = Buffer.from("rough cut v1");
const CUT_BUILD = createHash("md5").update(CUT).digest("hex").slice(0, 8);

afterEach(async () => {
  process.chdir(originalCwd);
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("review queue", () => {
  it("lists a finished cut waiting at the final gate with its build, creative summaries, and findings", async () => {
    const root = await finishedEpisode();

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "queue"], { from: "node" });

    const rows = output().stdout.trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      event: "review_queue_item",
      target: "show/episode",
      title: "Episode",
      status: "review",
      stage: "compose",
      final_review: "pass",
      video: { exists: true, build: CUT_BUILD, duration_s: 12, path: path.join(root, "renders", "cut.mp4") },
      creative: [
        { stage: "idea", status: "completed", auto_approved: true, summary: ["Night drive through a flooded city", "6 scenes"] },
      ],
      findings: { critical: 0, suggestions: 1, nitpicks: 0, open: [{ stage: "idea", severity: "suggestion", title: "Tighten the hook" }] },
    });
  });

  it("hides approved episodes unless --all is passed", async () => {
    await finishedEpisode();
    await run(["approve", "show/episode", "--build", CUT_BUILD]);

    expect((await run(["queue"])).stdout).toContain("nothing waiting on review");
    const all = JSON.parse((await run(["--json", "queue", "--all"])).stdout.trim()) as { status: string; review: unknown };
    expect(all).toMatchObject({ status: "approved", review: { decision: "approved", build: CUT_BUILD, stage: "compose" } });
  });

  it("refuses a decision made on a stale build", async () => {
    await finishedEpisode();

    await expect(run(["approve", "show/episode", "--build", "deadbeef"])).rejects.toThrow(
      `--build deadbeef is stale: the current cut of show/episode is build ${CUT_BUILD}`,
    );
    await expect(run(["reject", "show/episode", "no", "--build", "deadbeef"])).rejects.toThrow("is stale");
  });

  it("sends notes back to an earlier stage and supersedes it and every later checkpoint", async () => {
    const root = await finishedEpisode();

    const { stdout } = await run([
      "--json",
      "revise",
      "show/episode",
      "Make the chorus shots faster",
      "--stage",
      "script",
      "--build",
      CUT_BUILD,
    ]);

    expect(JSON.parse(stdout.trim())).toMatchObject({
      event: "stage_sent_back",
      stage: "script",
      from_stage: "compose",
      superseded: ["script", "compose"],
      build: CUT_BUILD,
    });
    await expect(listCheckpoints(root, "show", "episode")).resolves.toEqual(["idea"]);
    await expect(readState(root, "show", "episode")).resolves.toMatchObject({
      current_stage: "script",
      revision_notes: { script: ["Make the chorus shots faster"] },
      queued_stage_revision: { stage: "script", note: "Make the chorus shots faster" },
      review: { decision: "changes", stage: "script", build: CUT_BUILD },
    });
    const superseded = path.join(checkpointDir(root, "show", "episode"), "superseded");
    await expect(access(superseded)).resolves.toBeUndefined();
  });

  it("rejects an episode and reports it as rejected", async () => {
    await finishedEpisode();

    await run(["reject", "show/episode", "Wrong song for this treatment", "--build", CUT_BUILD]);

    const row = JSON.parse((await run(["--json", "queue", "--all"])).stdout.trim()) as Record<string, unknown>;
    expect(row).toMatchObject({
      status: "rejected",
      review: { decision: "rejected", note: "Wrong song for this treatment", build: CUT_BUILD },
    });
  });

  it("lists a run halted on a critical finding before the final stage as needs_attention", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "idea", checkpoint("idea", "awaiting_human", ideaArtifact()));
    process.chdir(root);

    const row = JSON.parse((await run(["--json", "queue"])).stdout.trim()) as Record<string, unknown>;
    expect(row).toMatchObject({ status: "needs_attention", stage: "idea", video: null });
  });
});

async function finishedEpisode(): Promise<string> {
  const root = await scratchProject();
  await mkdir(path.join(root, "renders"), { recursive: true });
  await writeFile(path.join(root, "renders", "cut.mp4"), CUT);
  await writeCheckpoint(root, "show", "episode", "idea", {
    ...checkpoint("idea", "completed", ideaArtifact()),
    review_summary: {
      decision: "pass",
      rounds: 1,
      critical: 0,
      suggestions: 1,
      nitpicks: 0,
      findings: [{ severity: "suggestion", title: "Tighten the hook" }],
    },
  });
  await writeCheckpoint(root, "show", "episode", "script", checkpoint("script", "completed", { lines: [] }));
  await writeCheckpoint(
    root,
    "show",
    "episode",
    "compose",
    checkpoint("compose", "awaiting_human", {
      output_path: "renders/cut.mp4",
      duration_s: 12,
      final_review: { status: "pass" },
    }),
  );
  await recordDecision(
    "show/episode",
    {
      id: "auto-approval-idea-1",
      stage: "idea",
      timestamp: "2026-05-12T15:00:00Z",
      category: "downgrade_approval",
      options_considered: [
        { label: "pause_for_human_approval", rejected_because: "deferred", notes: null },
        { label: "auto_approve_until_final_review", rejected_because: null, notes: null },
      ],
      picked: "auto_approve_until_final_review",
      reason: "deferred to the final gate",
      confidence: 0.6,
      user_visible: true,
      supersedes: null,
    },
    { root },
  );
  process.chdir(root);
  return root;
}

function ideaArtifact(): Record<string, unknown> {
  return { title: "Night drive through a flooded city", scenes: [1, 2, 3, 4, 5, 6] };
}

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-queue-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit", "pipelines"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# test project\n", "utf8");
  await writeFile(
    path.join(root, ".predit", "pipelines", "music-video.yaml"),
    [
      "slug: music-video",
      "stages:",
      "  - slug: idea",
      "    skill: pipelines/music-video/idea-director.md",
      "    produces: brief",
      "    human_approval: required",
      "  - slug: script",
      "    skill: pipelines/music-video/script-director.md",
      "    produces: script",
      "  - slug: compose",
      "    skill: pipelines/music-video/compose-director.md",
      "    produces: render_report",
      "",
    ].join("\n"),
    "utf8",
  );
  const showDir = path.join(root, "shows", "show");
  await mkdir(path.join(showDir, "episodes"), { recursive: true });
  await writeFile(
    path.join(showDir, "show.yaml"),
    ["slug: show", 'display_name: "Test Show"', "created: 2026-05-12", "pipelines:", "  music-video: {}", "defaults:", "  pipeline: music-video", ""].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(showDir, "episodes", "episode.yaml"),
    ["slug: episode", 'title: "Episode"', "created: 2026-05-12", "pipeline: music-video", ""].join("\n"),
    "utf8",
  );
  return root;
}

function checkpoint(stage: string, status: Checkpoint["status"], artifact: unknown): Checkpoint {
  return { stage, status, timestamp: "2026-05-12T15:42:00Z", artifact, tool_invocations: [] };
}

async function run(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { program, output } = captureProgram();
  await program.parseAsync(["node", "predit", ...args], { from: "node" });
  return output();
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
