import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CostEntry } from "../artifacts/cost-log.js";
import { costLogFile } from "./paths.js";
import { readCostLog, recordCost } from "./tracker.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-cost-tracker-${randomUUID()}`);
  scratchDirs.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("cost tracker", () => {
  it("appends the first entry and creates cost_log.json", async () => {
    const root = await scratchProject();

    const log = await recordCost(root, "show", "episode", costEntry({ usd: 0.12, mode: "sample" }));

    expect(log).toEqual([costEntry({ usd: 0.12, mode: "sample" })]);
    const raw = await readFile(costLogFile(root, "show", "episode"), "utf8");
    expect(JSON.parse(raw)).toEqual(log);
  });

  it("appends to an existing log while preserving order", async () => {
    const root = await scratchProject();
    const first = costEntry({ tool: "image_generation", usd: 0.12, mode: "sample" });
    const second = costEntry({ tool: "video_generation", usd: 1.25, mode: "full" });

    await recordCost(root, "show", "episode", first);
    const log = await recordCost(root, "show", "episode", second);

    expect(log).toEqual([first, second]);
    await expect(readCostLog(root, "show", "episode")).resolves.toEqual([first, second]);
  });

  it("returns an empty log when cost_log.json is absent", async () => {
    const root = await scratchProject();

    await expect(readCostLog(root, "show", "episode")).resolves.toEqual([]);
  });

  it("rejects entries with negative usd", async () => {
    const root = await scratchProject();

    await expect(
      recordCost(root, "show", "episode", {
        ...costEntry({ usd: 0.12, mode: "sample" }),
        usd: -1,
      } as unknown as CostEntry),
    ).rejects.toThrow("Number must be greater than or equal to 0");
  });

  it("serializes concurrent appends so the log remains parseable and complete", async () => {
    const root = await scratchProject();
    const entries = [
      costEntry({ tool: "image_generation", usd: 0.12, mode: "sample" }),
      costEntry({ tool: "tts", usd: 0.08, mode: "sample" }),
      costEntry({ tool: "video_generation", usd: 1.25, mode: "full" }),
    ];

    await Promise.all(entries.map((entry) => recordCost(root, "show", "episode", entry)));

    await expect(readCostLog(root, "show", "episode")).resolves.toEqual(entries);
  });
});

function costEntry(overrides: Partial<CostEntry>): CostEntry {
  return {
    tool: "image_generation",
    provider: "openai",
    model: "image-model",
    units: 1,
    usd: 0.12,
    mode: "sample",
    ...overrides,
  };
}
