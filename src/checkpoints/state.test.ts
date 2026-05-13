import { randomUUID } from "node:crypto";
import { readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { projectDir, stateFile } from "./paths.js";
import { readState, updateState, writeState } from "./state.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-state-${randomUUID()}`);
  scratchDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("pipeline state", () => {
  it("writes state.json and reads it back", async () => {
    const root = await scratchProject();
    const state = {
      show: "show",
      episode: "episode",
      pipeline: "music-video",
      current_stage: "idea",
      last_status: "in_progress" as const,
      last_checkpoint_at: "2026-05-12T15:42:00Z",
      cost_total_usd: 0.25,
      sample: { latest_version: 1 },
    };

    await writeState(root, "show", "episode", state);

    await expect(readState(root, "show", "episode")).resolves.toEqual(state);
    expect(stateFile(root, "show", "episode")).toBe(path.join(root, "projects", "show", "episode", "state.json"));
  });

  it("returns undefined when state.json is absent", async () => {
    const root = await scratchProject();

    await expect(readState(root, "show", "episode")).resolves.toBeUndefined();
  });

  it("shallow-merges state patches", async () => {
    const root = await scratchProject();
    await writeState(root, "show", "episode", {
      show: "show",
      episode: "episode",
      pipeline: "music-video",
      current_stage: "idea",
      sample: { latest_version: 1, note: "keep" },
    });

    const updated = await updateState(root, "show", "episode", {
      current_stage: "script",
      last_status: "completed",
      sample: { latest_version: 2 },
    });

    expect(updated).toEqual({
      show: "show",
      episode: "episode",
      pipeline: "music-video",
      current_stage: "script",
      last_status: "completed",
      sample: { latest_version: 2 },
    });
    await expect(readState(root, "show", "episode")).resolves.toEqual(updated);
  });

  it("creates no temp files after an atomic write succeeds", async () => {
    const root = await scratchProject();

    await writeState(root, "show", "episode", {
      show: "show",
      episode: "episode",
      pipeline: "music-video",
    });

    await expect(readdir(projectDir(root, "show", "episode"))).resolves.toEqual(["state.json"]);
  });
});
