import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { InvalidCheckpoint } from "./errors.js";
import { sampleCheckpointFile } from "./paths.js";
import {
  latestSampleVersion,
  readSampleCheckpoint,
  writeSampleCheckpoint,
  type SampleCheckpointPayload,
} from "./sample.js";
import { readState } from "./state.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-sample-checkpoint-${randomUUID()}`);
  scratchDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("sample checkpoints", () => {
  it("writes a versioned sample checkpoint with awaiting_human status and cost fields", async () => {
    const root = await scratchProject();

    const checkpoint = await writeSampleCheckpoint(root, "show", "episode", 1, samplePayload());

    expect(checkpoint).toEqual(
      expect.objectContaining({
        version: 1,
        status: "awaiting_human",
        cost_for_this_sample: 0.4,
        cumulative_sample_cost: 1.1,
        projected_full_cost: 4.8,
        sample_video_path: "projects/show/episode/renders/sample.mp4",
      }),
    );
    expect(checkpoint.timestamp).toEqual(expect.any(String));

    const raw = await readFile(sampleCheckpointFile(root, "show", "episode", 1), "utf8");
    expect(JSON.parse(raw)).toMatchObject({
      version: 1,
      status: "awaiting_human",
      cost_for_this_sample: 0.4,
      cumulative_sample_cost: 1.1,
      projected_full_cost: 4.8,
      sample_video_path: "projects/show/episode/renders/sample.mp4",
    });
  });

  it("tracks the latest sample version in state.json", async () => {
    const root = await scratchProject();

    await writeSampleCheckpoint(root, "show", "episode", 1, samplePayload());
    await writeSampleCheckpoint(root, "show", "episode", 2, {
      ...samplePayload(),
      sample_video_path: "projects/show/episode/renders/sample-v2.mp4",
    });

    await expect(readSampleCheckpoint(root, "show", "episode", 2)).resolves.toMatchObject({
      version: 2,
      sample_video_path: "projects/show/episode/renders/sample-v2.mp4",
    });
    await expect(readState(root, "show", "episode")).resolves.toMatchObject({
      sample: { latest_version: 2 },
    });
  });

  it("rejects payloads that omit required cost fields", async () => {
    const root = await scratchProject();

    await expect(
      writeSampleCheckpoint(root, "show", "episode", 1, {
        sample_video_path: "projects/show/episode/renders/sample.mp4",
      } as unknown as SampleCheckpointPayload),
    ).rejects.toBeInstanceOf(InvalidCheckpoint);
  });

  it("returns zero for latest sample version when state is absent", () => {
    expect(latestSampleVersion(undefined)).toBe(0);
  });
});

function samplePayload(): SampleCheckpointPayload {
  return {
    cost_for_this_sample: 0.4,
    cumulative_sample_cost: 1.1,
    projected_full_cost: 4.8,
    sample_video_path: "projects/show/episode/renders/sample.mp4",
  };
}
