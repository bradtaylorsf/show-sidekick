import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Checkpoint, CheckpointStatus } from "./checkpoint.js";
import { writeCheckpoint } from "./io.js";
import { getNextStage } from "./resume.js";
import type { Pipeline } from "../pipelines/manifest.js";
import type { Stage } from "../pipelines/stage.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-resume-${randomUUID()}`);
  scratchDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("resume protocol", () => {
  it("returns the first stage for a fresh project", async () => {
    const root = await scratchProject();

    await expect(getNextStage(root, "show", "episode", pipeline())).resolves.toEqual({
      kind: "run",
      stage: stage("idea"),
    });
  });

  it("advances to the next stage after a completed checkpoint", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "idea", checkpoint("idea", "completed"));

    await expect(getNextStage(root, "show", "episode", pipeline())).resolves.toEqual({
      kind: "run",
      stage: stage("script"),
    });
  });

  it("returns done after the last stage is completed", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "compose", checkpoint("compose", "completed"));

    await expect(getNextStage(root, "show", "episode", pipeline())).resolves.toEqual({ kind: "done" });
  });

  it("stays on an awaiting_human checkpoint stage", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "script", checkpoint("script", "awaiting_human"));

    await expect(getNextStage(root, "show", "episode", pipeline())).resolves.toEqual({
      kind: "awaiting_human",
      stage: stage("script"),
    });
  });

  it("surfaces failed checkpoints at their stage", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "script", checkpoint("script", "failed"));

    await expect(getNextStage(root, "show", "episode", pipeline())).resolves.toEqual({
      kind: "failed",
      stage: stage("script"),
    });
  });

  it("treats in_progress checkpoints as crashed", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "script", checkpoint("script", "in_progress"));

    await expect(getNextStage(root, "show", "episode", pipeline())).resolves.toEqual({
      kind: "crashed",
      stage: stage("script"),
    });
  });

  it("ignores checkpoint files for stages that are not in the pipeline", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "orphan", checkpoint("orphan", "completed"));

    await expect(getNextStage(root, "show", "episode", pipeline())).resolves.toEqual({
      kind: "run",
      stage: stage("idea"),
    });
  });

  it("uses the highest stage in pipeline order when multiple checkpoints exist", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "idea", checkpoint("idea", "failed"));
    await writeCheckpoint(root, "show", "episode", "script", checkpoint("script", "completed"));

    await expect(getNextStage(root, "show", "episode", pipeline())).resolves.toEqual({
      kind: "run",
      stage: stage("compose"),
    });
  });
});

function pipeline(): Pipeline {
  return {
    slug: "music-video",
    stages: [stage("idea"), stage("script"), stage("compose")],
    orchestration: {
      budget_default_usd: 3,
      max_revisions_per_stage: 2,
      max_send_backs: 3,
      max_wall_time_minutes: 30,
    },
  };
}

function stage(slug: string): Stage {
  return {
    slug,
    skill: `pipelines/music-video/${slug}-director.md`,
    produces: `${slug}_artifact`,
    produces_artifacts: [],
    required_artifacts_in: [],
    optional_artifacts_in: [],
    required_tools: [],
    optional_tools: [],
    tools_available: [],
    review_focus: [],
    success_criteria: [],
    human_approval: "optional",
  };
}

function checkpoint(stageSlug: string, status: CheckpointStatus): Checkpoint {
  return {
    stage: stageSlug,
    status,
    timestamp: "2026-05-12T15:42:00Z",
    artifact: { ok: true },
    tool_invocations: [],
  };
}
