import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DecisionEntry } from "../artifacts/decision-log.js";
import { currentDecisions, decisionsPath, readDecisionLog, recordDecision } from "./store.js";

let scratchDirs: string[] = [];

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-decisions-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, ".predit"), { recursive: true });
  await writeFile(path.join(root, "CLAUDE.md"), "# project\n", "utf8");

  return root;
}

function decision(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: "runtime-proposal",
    stage: "proposal",
    timestamp: "2026-05-12T15:18:42Z",
    category: "render_runtime_selection",
    options_considered: [
      { label: "remotion", rejected_because: null },
      { label: "hyperframes", rejected_because: null },
    ],
    picked: "remotion",
    reason: "Remotion matches the approved renderer plan.",
    confidence: 0.82,
    user_visible: true,
    supersedes: null,
    ...overrides,
  };
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("decision store", () => {
  it("creates decisions.json and atomically appends entries", async () => {
    const root = await scratchProject();
    const first = decision();
    const second = decision({ id: "runtime-edit", stage: "edit", picked: "hyperframes", supersedes: "runtime-proposal" });

    await recordDecision("demo/episode", first, { root });
    const log = await recordDecision("demo/episode", second, { root });
    const raw = await readFile(decisionsPath("demo/episode", { root }), "utf8");

    expect(log).toHaveLength(2);
    expect(JSON.parse(raw)).toEqual([first, second]);
  });

  it("returns an empty log when decisions.json is absent", async () => {
    const root = await scratchProject();

    await expect(readDecisionLog("demo/episode", { root })).resolves.toEqual([]);
  });

  it("rejects schema-invalid entries before writing", async () => {
    const root = await scratchProject();

    await expect(
      recordDecision(
        "demo/episode",
        {
          ...decision(),
          options_considered: [{ label: "remotion", rejected_because: null }],
        },
        { root },
      ),
    ).rejects.toThrow("Array must contain at least 2 element(s)");
    await expect(readDecisionLog("demo/episode", { root })).resolves.toEqual([]);
  });

  it("returns the non-superseded subset", () => {
    const first = decision();
    const second = decision({ id: "runtime-edit", stage: "edit", picked: "hyperframes", supersedes: first.id });

    expect(currentDecisions([first, second])).toEqual([second]);
  });
});
