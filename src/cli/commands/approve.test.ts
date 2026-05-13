import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readCheckpoint, readState, writeCheckpoint, type Checkpoint } from "../../checkpoints/index.js";
import { readDecisionLog } from "../../decisions/store.js";
import { createProgram } from "../program.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-approve-${randomUUID()}`);
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

describe("approve command", () => {
  it("marks an awaiting_human checkpoint completed and updates state", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "idea", checkpoint("idea", "awaiting_human"));
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(["node", "predit", "--json", "approve", "show/episode"], { from: "node" });

    const event = JSON.parse(output().stdout.trim()) as { event: string; stage: string };
    expect(event).toEqual(expect.objectContaining({ event: "stage_approved", stage: "idea" }));
    await expect(readCheckpoint(root, "show", "episode", "idea")).resolves.toMatchObject({
      status: "completed",
    });
    await expect(readState(root, "show", "episode")).resolves.toMatchObject({
      current_stage: "idea",
      last_status: "completed",
      pipeline: "music-video",
    });
  });

  it("refuses when no awaiting_human checkpoint is current", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "idea", checkpoint("idea", "completed"));
    process.chdir(root);

    const { program } = captureProgram();

    await expect(program.parseAsync(["node", "predit", "approve", "show/episode"], { from: "node" })).rejects.toThrow(
      "no awaiting_human checkpoint to approve for show/episode",
    );
  });

  it("force-approves a failed final review and records an audited decision", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "compose", failedFinalReviewCheckpoint());
    process.chdir(root);

    const { program, output } = captureProgram();
    await program.parseAsync(
      ["node", "predit", "--json", "approve", "show/episode", "--force", "User inspected final-failed.mp4 and approved the downgrade."],
      { from: "node" },
    );

    const event = JSON.parse(output().stdout.trim()) as { event: string; decision_id: string };
    expect(event).toEqual(expect.objectContaining({ event: "stage_force_approved", decision_id: expect.stringMatching(/^force_approval-/) }));
    await expect(readDecisionLog("show/episode", { root })).resolves.toEqual([
      expect.objectContaining({
        id: event.decision_id,
        stage: "compose",
        category: "downgrade_approval",
        picked: "force_approval",
      }),
    ]);
    await expect(readCheckpoint(root, "show", "episode", "compose")).resolves.toMatchObject({ status: "completed" });
  });

  it("refuses force approval unless the current failed checkpoint is a failed final review", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "compose", checkpoint("compose", "failed"));
    process.chdir(root);

    const { program } = captureProgram();

    await expect(
      program.parseAsync(["node", "predit", "approve", "show/episode", "--force", "approve anyway"], { from: "node" }),
    ).rejects.toThrow('final_review.status === "fail"');
    await expect(readDecisionLog("show/episode", { root })).resolves.toEqual([]);
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
      "  - slug: compose",
      "    skill: pipelines/music-video/compose-director.md",
      "    produces: final_review",
      "",
    ].join("\n"),
    "utf8",
  );
}

function checkpoint(stage: string, status: "completed" | "awaiting_human" | "failed"): Checkpoint {
  return {
    stage,
    status,
    timestamp: "2026-05-12T15:42:00Z",
    artifact: { ok: true },
    tool_invocations: [],
  };
}

function failedFinalReviewCheckpoint(): Checkpoint {
  return {
    stage: "compose",
    status: "failed",
    timestamp: "2026-05-12T15:42:00Z",
    artifact: {
      status: "fail",
      recommended_action: "block",
      checks: {
        technical_probe: {
          container: "mp4",
          duration_s: 12,
          duration_promised_s: 12,
          width: 1920,
          height: 1080,
          framerate: 30,
          video_codec: "h264",
          audio_codec: "aac",
          audio_channels: 2,
          bitrate_kbps: 6200,
          verdict: "pass",
        },
        visual_spotcheck: {
          frames_sampled: 4,
          sample_points_pct: [10, 35, 65, 90],
          findings: [],
        },
        audio_spotcheck: {
          narration_present: true,
          music_present: true,
          caption_sync_accuracy: 0.98,
          findings: [],
        },
        promise_preservation: {
          delivery_promise_honored: false,
          silent_downgrade_detected: true,
          runtime_swap_detected: false,
          runtime_swap_check: "ok",
          motion_ratio_actual: 0.1,
          render_runtime_used: "remotion",
          findings: [],
        },
        subtitle_check: {
          present: true,
          accuracy_within_150ms: 0.98,
        },
      },
      issues_found: [],
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
