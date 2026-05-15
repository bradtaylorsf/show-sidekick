import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  discoverDemoMatrixLanes,
  parseDemoMatrixArgs,
  runDemoMatrix,
} from "./demo-matrix.ts";
import { parseLastEvent, type SpawnCommand, type SpawnResult } from "./lib/spawn-cli.ts";

const scratchDirs: string[] = [];

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs.length = 0;
});

describe("demo matrix runner", () => {
  it("parses mode and lane flags", () => {
    expect(parseDemoMatrixArgs(["--paid-demo", "--only", "news-song", "--only=music-video", "--keep-workdir", "--json"])).toEqual({
      mode: "paid-demo",
      only: ["news-song", "music-video"],
      keepWorkdir: true,
      json: true,
      cliPath: undefined,
    });

    expect(parseDemoMatrixArgs(["--zero-key"]).mode).toBe("zero-key");
    expect(() => parseDemoMatrixArgs(["--zero-key", "--paid-demo"])).toThrow("--zero-key and --paid-demo");
  });

  it("discovers only starters compatible with the selected sample mode", async () => {
    const paid = await discoverDemoMatrixLanes({
      repoRoot: process.cwd(),
      mode: "paid-demo",
      only: ["music-video", "news-song", "documentary"],
    });
    expect(paid.map((lane) => lane.slug)).toEqual(["music-video", "news-song"]);

    const zeroKey = await discoverDemoMatrixLanes({
      repoRoot: process.cwd(),
      mode: "zero-key",
    });
    expect(zeroKey.map((lane) => lane.slug)).toEqual(["music-video"]);
  });

  it("runs selected paid-demo lanes through init and build commands", async () => {
    const tempRoot = await testTempRoot();
    const calls: Array<{ command: string; args: readonly string[]; cwd: string }> = [];
    const runCommand: SpawnCommand = async (command, args, options) => {
      calls.push({ command, args, cwd: options.cwd });
      return successfulCommand(command, args, options.cwd);
    };
    const lines: string[] = [];

    const result = await runDemoMatrix({
      argv: ["--paid-demo", "--only", "news-song", "--keep-workdir", "--json"],
      tempRoot,
      runCommand,
      env: { ...process.env, OPENAI_API_KEY: "set", ELEVENLABS_API_KEY: "set" },
      write: (line) => lines.push(line),
      now: () => new Date("2026-05-15T12:00:00.000Z"),
    });

    expect(result.exitCode).toBe(0);
    expect(result.status).toBe("completed");
    expect(result.working_dir.startsWith(tempRoot)).toBe(true);
    expect(path.relative(process.cwd(), result.working_dir).startsWith("..")).toBe(true);
    expect(result.results).toHaveLength(1);
    expect(result.results[0]?.command).toContain("--provider-profile paid-demo");
    expect(calls.some((call) => call.args.includes("init") && call.args.includes("--starter") && call.args.includes("news-song"))).toBe(true);
    expect(calls.some((call) => call.args.includes("build") && call.args.includes("news-song/sample-episode"))).toBe(true);

    const events = lines.flatMap((line) => line.trim().split("\n").filter(Boolean).map((entry) => JSON.parse(entry) as { event: string }));
    expect(events.map((event) => event.event)).toEqual(["matrix_started", "lane_completed", "matrix_finished"]);
  });

  it("summarizes failed lanes with command, exit code, last event, and artifacts", async () => {
    const tempRoot = await testTempRoot();
    const runCommand: SpawnCommand = async (command, args, options) => {
      if (args.includes("build")) {
        await writeArtifact(options.cwd, "music-video");
        return commandResult({
          command,
          args,
          cwd: options.cwd,
          exitCode: 1,
          stdout: `${JSON.stringify({ event: "build_finished", status: "failed", last_stage: "assets" })}\n`,
          stderr: "provider failed",
        });
      }
      return successfulCommand(command, args, options.cwd);
    };

    const result = await runDemoMatrix({
      argv: ["--zero-key", "--only", "music-video", "--keep-workdir"],
      tempRoot,
      runCommand,
      write: () => undefined,
    });

    expect(result.exitCode).toBe(2);
    expect(result.status).toBe("failed");
    expect(result.failure_count).toBe(1);
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        slug: "music-video",
        exit_code: 1,
        status: "failed",
        error: "provider failed",
        last_event: expect.objectContaining({ event: "build_finished", status: "failed", last_stage: "assets" }),
      }),
    );
    expect(result.results[0]?.artifact_paths).toContain("projects/music-video/sample-episode/checkpoints/assets.failed.json");
  });
});

async function testTempRoot(): Promise<string> {
  const dir = path.join(tmpdir(), `predit-demo-matrix-test-${Date.now()}-${Math.random().toString(16).slice(2)}`);
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
      stdout: `${JSON.stringify({ event: "build_started" })}\n${JSON.stringify({ event: "build_finished", status: "completed", total_cost_usd: 0.12 })}\n`,
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

async function writeArtifact(cwd: string, showSlug: string): Promise<void> {
  const checkpointDir = path.join(cwd, "projects", showSlug, "sample-episode", "checkpoints");
  await mkdir(checkpointDir, { recursive: true });
  await writeFile(path.join(checkpointDir, "assets.failed.json"), "{}\n");
}
