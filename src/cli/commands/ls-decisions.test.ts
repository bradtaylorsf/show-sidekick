import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DecisionEntry } from "../../artifacts/decision-log.js";
import { recordDecision } from "../../decisions/store.js";
import { resetLoggerMode } from "../../log/mode.js";
import { createProgram } from "../program.js";
import { renderDecisionTable } from "./ls-decisions.js";

let scratchDirs: string[] = [];
const originalCwd = process.cwd();

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-ls-decisions-${randomUUID()}`);
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

afterEach(async () => {
  process.chdir(originalCwd);
  resetLoggerMode();
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("ls decisions", () => {
  it("renders the decision log as a human table", async () => {
    const root = await scratchProject();
    await recordDecision("demo/episode", decision(), { root });
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "ls", "decisions", "demo/episode"], { from: "node" });

    expect(output().stdout).toContain("stage");
    expect(output().stdout).toContain("runtime-proposal");
    expect(output().stdout).toContain("render_runtime_selection");
  });

  it("renders the decision log as NDJSON with --json", async () => {
    const root = await scratchProject();
    await recordDecision("demo/episode", decision(), { root });
    process.chdir(root);
    const { program, output } = captureProgram();

    await program.parseAsync(["node", "predit", "--json", "ls", "decisions", "demo/episode"], { from: "node" });

    const lines = output().stdout.trim().split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? "{}")).toMatchObject({
      id: "runtime-proposal",
      category: "render_runtime_selection",
    });
  });

  it("renders empty logs without throwing", () => {
    expect(renderDecisionTable([])).toBe("No decisions recorded.\n");
  });
});
