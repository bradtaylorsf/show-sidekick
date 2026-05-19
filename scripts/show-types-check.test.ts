import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runShowTypeMatrix } from "./show-types-matrix.ts";
import { runShowTypesCheck } from "./show-types-check.ts";
import { parseLastEvent, type SpawnCommand, type SpawnResult } from "./lib/spawn-cli.ts";
import type { LaneVerification, VerifyLaneInput } from "./lib/verify-render.ts";

const scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs.length = 0;
});

describe("show type validation commands", () => {
  it("checks the catalog without rendering", async () => {
    const lines: string[] = [];
    const result = await runShowTypesCheck({
      repoRoot: process.cwd(),
      write: (line) => lines.push(line),
    });

    expect(result).toMatchObject({
      status: "passed",
      pipeline_lane_count: 15,
      starter_lane_count: 11,
      exitCode: 0,
    });
    expect(lines.join("")).toContain("show-types:check passed");
  });

  it("writes JSON and Markdown reports for a catalog-driven matrix run", async () => {
    const tempRoot = await testTempRoot();
    const runCommand: SpawnCommand = async (command, args, options) => successfulCommand(command, args, options.cwd);
    const lines: string[] = [];

    const result = await runShowTypeMatrix({
      argv: ["--zero-key", "--only", "starter:animated-explainer"],
      tempRoot,
      repoRoot: process.cwd(),
      runCommand,
      verifyLane: async (input) => passedVerification(input),
      write: (line) => lines.push(line),
      now: () => new Date("2026-05-15T12:00:00.000Z"),
    });

    expect(result.exitCode).toBe(0);
    expect(result.report.summary.verified).toBe(1);
    expect(result.report.lanes).toContainEqual(
      expect.objectContaining({
        lane_id: "starter:animated-explainer",
        status: "verified",
      }),
    );
    expect(JSON.parse(await readFile(result.json_report_path, "utf8"))).toMatchObject({
      event: "show_type_matrix_report",
      mode: "zero-key",
    });
    expect(await readFile(result.markdown_report_path, "utf8")).toContain("| starter:animated-explainer |");
    expect(lines.join("")).toContain("Reports:");
  });
});

async function testTempRoot(): Promise<string> {
  const dir = path.join(tmpdir(), `show-types-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
  await mkdir(dir, { recursive: true });
  scratchDirs.push(dir);
  return dir;
}

function successfulCommand(command: string, args: readonly string[], cwd: string): SpawnResult {
  if (args.includes("--version")) {
    return commandResult({ command, args, cwd, stdout: "0.0.0\n" });
  }
  if (command === "which") {
    const binary = args[0] ?? "binary";
    return commandResult({ command, args, cwd, stdout: `/usr/local/bin/${binary}\n` });
  }
  if (args.includes("init")) {
    return commandResult({ command, args, cwd, stdout: `${JSON.stringify({ event: "project_initialized" })}\n` });
  }
  if (args.includes("build")) {
    return commandResult({
      command,
      args,
      cwd,
      stdout: `${JSON.stringify({ event: "build_finished", status: "completed", total_cost_usd: 0 })}\n`,
    });
  }
  return commandResult({ command, args, cwd });
}

function commandResult(input: {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly exitCode?: number;
  readonly stdout?: string;
  readonly stderr?: string;
}): SpawnResult {
  const stdout = input.stdout ?? "";
  return {
    command: input.command,
    args: [...input.args],
    cwd: input.cwd,
    exitCode: input.exitCode ?? 0,
    signal: null,
    stdout,
    stderr: input.stderr ?? "",
    timedOut: false,
    lastEvent: parseLastEvent(stdout),
  };
}

function passedVerification(input: VerifyLaneInput): LaneVerification {
  return {
    status: "passed",
    slug: input.slug,
    pipeline: input.pipeline,
    target: input.target,
    project_dir: input.projectDir,
    generated_at: "2026-05-15T12:00:00.000Z",
    artifact_presence: [],
    export_results: [
      { target: "edl", status: "completed" },
      { target: "premiere", status: "completed" },
    ],
    errors: [],
  };
}
