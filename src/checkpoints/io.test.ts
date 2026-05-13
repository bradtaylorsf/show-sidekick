import { randomUUID } from "node:crypto";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Checkpoint, CheckpointStatus } from "./checkpoint.js";
import { CheckpointMissingError, InvalidCheckpoint } from "./errors.js";
import { listCheckpoints, readCheckpoint, writeCheckpoint } from "./io.js";
import { checkpointDir, checkpointFile } from "./paths.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-checkpoint-io-${randomUUID()}`);
  scratchDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("checkpoint IO", () => {
  it("writes and reads checkpoints with schema defaults", async () => {
    const root = await scratchProject();
    const checkpoint = makeCheckpoint("idea", "completed");

    await writeCheckpoint(root, "show", "episode", "idea", checkpoint);

    await expect(readCheckpoint(root, "show", "episode", "idea")).resolves.toEqual(checkpoint);
  });

  it("uses atomic temp files without leaving temp files after success", async () => {
    const root = await scratchProject();

    await writeCheckpoint(root, "show", "episode", "script", makeCheckpoint("script", "completed"));

    const entries = await readdir(checkpointDir(root, "show", "episode"));
    expect(entries).toEqual(["script.json"]);
  });

  it("throws CheckpointMissingError when the checkpoint file does not exist", async () => {
    const root = await scratchProject();
    const filePath = checkpointFile(root, "show", "episode", "missing");

    await expect(readCheckpoint(root, "show", "episode", "missing")).rejects.toMatchObject({
      name: "CheckpointMissingError",
      filePath,
    });
    await expect(readCheckpoint(root, "show", "episode", "missing")).rejects.toBeInstanceOf(
      CheckpointMissingError,
    );
  });

  it("throws InvalidCheckpoint on malformed JSON", async () => {
    const root = await scratchProject();
    const filePath = checkpointFile(root, "show", "episode", "idea");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, "{", "utf8");

    await expect(readCheckpoint(root, "show", "episode", "idea")).rejects.toBeInstanceOf(InvalidCheckpoint);
  });

  it("throws InvalidCheckpoint on schema violations", async () => {
    const root = await scratchProject();
    const filePath = checkpointFile(root, "show", "episode", "idea");
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({ stage: "idea", status: "paused", timestamp: "2026-05-12T15:42:00Z" }),
      "utf8",
    );

    await expect(readCheckpoint(root, "show", "episode", "idea")).rejects.toMatchObject({
      name: "InvalidCheckpoint",
      filePath,
    });
  });

  it("returns an empty list when the checkpoint directory is missing", async () => {
    const root = await scratchProject();

    await expect(listCheckpoints(root, "show", "episode")).resolves.toEqual([]);
  });

  it("lists only checkpoint JSON files by stage slug", async () => {
    const root = await scratchProject();
    await writeCheckpoint(root, "show", "episode", "script", makeCheckpoint("script", "completed"));
    const dir = checkpointDir(root, "show", "episode");
    await writeFile(path.join(dir, "notes.txt"), "ignore", "utf8");

    await expect(listCheckpoints(root, "show", "episode")).resolves.toEqual(["script"]);
  });
});

function makeCheckpoint(stage: string, status: CheckpointStatus): Checkpoint {
  return {
    stage,
    status,
    timestamp: "2026-05-12T15:42:00Z",
    artifact: { ok: true },
    review_summary: {
      rounds: 1,
      critical: 0,
      suggestions: 0,
      nitpicks: 0,
      findings: [],
    },
    cost_snapshot: {
      stage_cost_usd: 0,
      total_so_far_usd: 0,
      budget_remaining_usd: 3,
    },
    tool_invocations: [],
  };
}
