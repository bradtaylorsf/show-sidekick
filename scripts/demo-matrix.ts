#!/usr/bin/env tsx

import { mkdir, mkdtemp, readdir, readFile, rm, stat } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import YAML from "yaml";
import { snapshotDemoMatrixEnv, type DemoMatrixEnvAvailability } from "./lib/preflight-env.ts";
import { commandLine, defaultSpawnCommand, type SpawnCommand, type SpawnResult } from "./lib/spawn-cli.ts";

export type DemoMatrixMode = "zero-key" | "paid-demo";
export type SampleSupport = "zero-key" | "paid" | "both" | "unsupported";

export type DemoMatrixCliArgs = {
  readonly mode: DemoMatrixMode;
  readonly only: readonly string[];
  readonly keepWorkdir: boolean;
  readonly json: boolean;
  readonly cliPath?: string;
};

export type DemoMatrixLane = {
  readonly slug: string;
  readonly showSlug: string;
  readonly pipeline: string;
  readonly sampleSupport: SampleSupport;
  readonly target: string;
};

export type CliInvocation = {
  readonly path: string;
  readonly command: string;
  readonly baseArgs: readonly string[];
  readonly version: string;
};

export type DemoMatrixLaneResult = {
  readonly slug: string;
  readonly pipeline: string;
  readonly target: string;
  readonly project_dir: string;
  readonly command: string;
  readonly exit_code: number;
  readonly status: string;
  readonly last_event?: Record<string, unknown>;
  readonly artifact_paths: readonly string[];
  readonly error?: string;
  readonly duration_ms: number;
};

export type DemoMatrixResult = {
  readonly event: "matrix_finished";
  readonly status: "completed" | "failed";
  readonly mode: DemoMatrixMode;
  readonly provider_profile?: "paid-demo";
  readonly cli: CliInvocation;
  readonly env: DemoMatrixEnvAvailability;
  readonly working_dir: string;
  readonly kept_workdir: boolean;
  readonly kept_paths: readonly string[];
  readonly success_count: number;
  readonly failure_count: number;
  readonly duration_ms: number;
  readonly results: readonly DemoMatrixLaneResult[];
  readonly exitCode: number;
};

export type DemoMatrixRunOptions = {
  readonly argv?: readonly string[];
  readonly repoRoot?: string;
  readonly tempRoot?: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly now?: () => Date;
  readonly runCommand?: SpawnCommand;
  readonly write?: (line: string) => void;
};

type MatrixStartedEvent = {
  readonly event: "matrix_started";
  readonly mode: DemoMatrixMode;
  readonly provider_profile?: "paid-demo";
  readonly cli: CliInvocation;
  readonly env: DemoMatrixEnvAvailability;
  readonly working_dir: string;
  readonly repo_root: string;
  readonly started_at: string;
  readonly lanes: readonly string[];
};

type LaneCompletedEvent = {
  readonly event: "lane_completed";
  readonly mode: DemoMatrixMode;
  readonly provider_profile?: "paid-demo";
  readonly result: DemoMatrixLaneResult;
};

class UsageError extends Error {
  readonly exitCode = 2;
}

const require = createRequire(import.meta.url);

export function parseDemoMatrixArgs(argv: readonly string[]): DemoMatrixCliArgs {
  let zeroKey = false;
  let paidDemo = false;
  let keepWorkdir = false;
  let json = false;
  let cliPath: string | undefined;
  const only: string[] = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--zero-key") {
      zeroKey = true;
      continue;
    }
    if (arg === "--paid-demo") {
      paidDemo = true;
      continue;
    }
    if (arg === "--keep-workdir") {
      keepWorkdir = true;
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--only") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError("--only requires a starter slug");
      }
      only.push(value);
      index += 1;
      continue;
    }
    if (arg?.startsWith("--only=")) {
      only.push(arg.slice("--only=".length));
      continue;
    }
    if (arg === "--cli-path") {
      const value = argv[index + 1];
      if (value === undefined || value.startsWith("--")) {
        throw new UsageError("--cli-path requires a path or binary name");
      }
      cliPath = value;
      index += 1;
      continue;
    }
    if (arg?.startsWith("--cli-path=")) {
      cliPath = arg.slice("--cli-path=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new UsageError(usageText());
    }

    throw new UsageError(`unknown option '${arg ?? ""}'\n${usageText()}`);
  }

  if (zeroKey && paidDemo) {
    throw new UsageError("--zero-key and --paid-demo are mutually exclusive");
  }

  return {
    mode: paidDemo ? "paid-demo" : "zero-key",
    only,
    keepWorkdir,
    json,
    cliPath,
  };
}

export async function discoverDemoMatrixLanes(input: {
  readonly repoRoot: string;
  readonly mode: DemoMatrixMode;
  readonly only?: readonly string[];
}): Promise<DemoMatrixLane[]> {
  const startersRoot = path.join(input.repoRoot, "bundled", "starters");
  const starterSlugs = await directoryNames(startersRoot);
  const requested = new Set(input.only ?? []);
  const allLanes: DemoMatrixLane[] = [];

  for (const starterSlug of starterSlugs) {
    const showPath = path.join(startersRoot, starterSlug, "show.yaml");
    const show = await readYamlRecord(showPath);
    const showSlug = stringField(show, "slug", starterSlug);
    const defaultPipeline = defaultPipelineSlug(show, showPath);
    const sampleSupport = await resolveStarterSampleSupport(input.repoRoot, show, defaultPipeline);

    allLanes.push({
      slug: starterSlug,
      showSlug,
      pipeline: defaultPipeline,
      sampleSupport,
      target: `${showSlug}/sample-episode`,
    });
  }

  const selected = allLanes.filter((lane) => requested.size === 0 || requested.has(lane.slug));
  const missing = [...requested].filter(
    (slug) => !allLanes.some((lane) => lane.slug === slug),
  );
  if (missing.length > 0) {
    throw new UsageError(`unknown demo lane: ${missing.join(", ")}`);
  }

  const runnable = selected.filter((lane) => sampleSupportAllows(lane.sampleSupport, input.mode));
  if (runnable.length === 0) {
    const scope = requested.size > 0 ? [...requested].join(", ") : "all bundled starters";
    throw new UsageError(`no ${input.mode} demo lanes selected for ${scope}`);
  }

  return runnable;
}

export async function runDemoMatrix(options: DemoMatrixRunOptions = {}): Promise<DemoMatrixResult> {
  const startedAt = Date.now();
  const args = parseDemoMatrixArgs(options.argv ?? []);
  const repoRoot = path.resolve(options.repoRoot ?? findRepoRoot());
  const env = options.env ?? process.env;
  const runCommand = options.runCommand ?? defaultSpawnCommand;
  const write = options.write ?? ((line: string) => process.stdout.write(line));
  const output = createOutput(args.json, write);
  const workingDir = await createMatrixWorkdir(repoRoot, options.tempRoot);
  const lanes = await discoverDemoMatrixLanes({ repoRoot, mode: args.mode, only: args.only });
  const cli = await resolveCliInvocation(args.cliPath, repoRoot, runCommand, env);
  const envAvailability = await snapshotDemoMatrixEnv({ cwd: repoRoot, env, runCommand });
  const providerProfile = args.mode === "paid-demo" ? "paid-demo" : undefined;

  output({
    event: "matrix_started",
    mode: args.mode,
    provider_profile: providerProfile,
    cli,
    env: envAvailability,
    working_dir: workingDir,
    repo_root: repoRoot,
    started_at: (options.now ?? (() => new Date()))().toISOString(),
    lanes: lanes.map((lane) => lane.slug),
  });

  const results: DemoMatrixLaneResult[] = [];
  try {
    for (const lane of lanes) {
      const result = await runLane({
        lane,
        mode: args.mode,
        cli,
        env,
        runCommand,
        workingDir,
      });
      results.push(result);
      output({
        event: "lane_completed",
        mode: args.mode,
        provider_profile: providerProfile,
        result,
      });
    }
  } finally {
    if (!args.keepWorkdir) {
      await rm(workingDir, { recursive: true, force: true });
    }
  }

  const failureCount = results.filter((result) => result.status !== "completed").length;
  const finished: DemoMatrixResult = {
    event: "matrix_finished",
    status: failureCount === 0 ? "completed" : "failed",
    mode: args.mode,
    provider_profile: providerProfile,
    cli,
    env: envAvailability,
    working_dir: workingDir,
    kept_workdir: args.keepWorkdir,
    kept_paths: args.keepWorkdir ? [workingDir] : [],
    success_count: results.length - failureCount,
    failure_count: failureCount,
    duration_ms: Date.now() - startedAt,
    results,
    exitCode: failureCount === 0 ? 0 : 2,
  };
  output(finished);

  return finished;
}

async function runLane(input: {
  readonly lane: DemoMatrixLane;
  readonly mode: DemoMatrixMode;
  readonly cli: CliInvocation;
  readonly env: NodeJS.ProcessEnv;
  readonly runCommand: SpawnCommand;
  readonly workingDir: string;
}): Promise<DemoMatrixLaneResult> {
  const startedAt = Date.now();
  const projectDir = path.join(input.workingDir, input.lane.slug);
  await mkdir(projectDir, { recursive: true });

  const initArgs = [...input.cli.baseArgs, "--json", "init", "--starter", input.lane.slug];
  const init = await input.runCommand(input.cli.command, initArgs, {
    cwd: projectDir,
    env: input.env,
  });
  if (init.exitCode !== 0) {
    return laneResultFromCommand({
      lane: input.lane,
      projectDir,
      result: init,
      durationMs: Date.now() - startedAt,
      status: "failed",
      error: init.stderr.trim() || "init failed",
    });
  }

  const buildArgs = [...input.cli.baseArgs, "--json", "build", input.lane.target, "--sample", "--non-interactive"];
  if (input.mode === "paid-demo") {
    buildArgs.push("--provider-profile", "paid-demo");
  }

  const build = await input.runCommand(input.cli.command, buildArgs, {
    cwd: projectDir,
    env: input.env,
  });
  const status = build.exitCode === 0 && build.lastEvent?.status === "completed" ? "completed" : eventStatus(build);

  return laneResultFromCommand({
    lane: input.lane,
    projectDir,
    result: build,
    durationMs: Date.now() - startedAt,
    status,
    error: status === "completed" ? undefined : build.stderr.trim() || "build failed",
  });
}

async function laneResultFromCommand(input: {
  readonly lane: DemoMatrixLane;
  readonly projectDir: string;
  readonly result: SpawnResult;
  readonly durationMs: number;
  readonly status: string;
  readonly error?: string;
}): Promise<DemoMatrixLaneResult> {
  return {
    slug: input.lane.slug,
    pipeline: input.lane.pipeline,
    target: input.lane.target,
    project_dir: input.projectDir,
    command: commandLine(input.result.command, input.result.args),
    exit_code: input.result.exitCode,
    status: input.status,
    last_event: input.result.lastEvent,
    artifact_paths: await collectArtifactPaths(input.projectDir, input.lane),
    error: input.error,
    duration_ms: input.durationMs,
  };
}

async function resolveCliInvocation(
  cliPath: string | undefined,
  repoRoot: string,
  runCommand: SpawnCommand,
  env: NodeJS.ProcessEnv,
): Promise<CliInvocation> {
  const invocation = cliPath === undefined ? localCliInvocation(repoRoot) : explicitCliInvocation(cliPath);
  const version = await runCommand(invocation.command, [...invocation.baseArgs, "--version"], {
    cwd: repoRoot,
    env,
    timeoutMs: 15_000,
  });

  return {
    ...invocation,
    version: version.exitCode === 0 ? version.stdout.trim() : `unavailable: ${version.stderr.trim() || version.exitCode}`,
  };
}

function localCliInvocation(repoRoot: string): Omit<CliInvocation, "version"> {
  const cliPath = path.join(repoRoot, "src", "cli", "index.ts");
  return {
    path: cliPath,
    command: process.execPath,
    baseArgs: ["--import", require.resolve("tsx"), cliPath],
  };
}

function explicitCliInvocation(cliPath: string): Omit<CliInvocation, "version"> {
  const resolved = cliPath.includes("/") || cliPath.startsWith(".") ? path.resolve(cliPath) : cliPath;
  if (resolved.endsWith(".ts")) {
    return {
      path: resolved,
      command: process.execPath,
      baseArgs: ["--import", require.resolve("tsx"), resolved],
    };
  }

  return {
    path: resolved,
    command: resolved,
    baseArgs: [],
  };
}

async function createMatrixWorkdir(repoRoot: string, tempRoot: string | undefined): Promise<string> {
  const root = path.resolve(tempRoot ?? tmpdir());
  const workingDir = await mkdtemp(path.join(root, "predit-demo-matrix-"));
  assertOutsideRepo(repoRoot, workingDir);
  return workingDir;
}

function assertOutsideRepo(repoRoot: string, targetPath: string): void {
  const relative = path.relative(path.resolve(repoRoot), path.resolve(targetPath));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    throw new UsageError(`refusing to write demo matrix workdir inside harness repo: ${targetPath}`);
  }
}

async function collectArtifactPaths(projectDir: string, lane: DemoMatrixLane): Promise<string[]> {
  const roots = [
    path.join(projectDir, "projects", lane.showSlug, "sample-episode"),
    path.join(projectDir, "exports"),
    path.join(projectDir, ".predit", "decisions"),
  ];
  const paths: string[] = [];

  for (const root of roots) {
    paths.push(...(await listFilesRelative(projectDir, root)));
  }

  return paths.sort((left, right) => left.localeCompare(right));
}

async function listFilesRelative(baseDir: string, targetDir: string): Promise<string[]> {
  try {
    const info = await stat(targetDir);
    if (!info.isDirectory()) {
      return [];
    }
  } catch {
    return [];
  }

  const entries = await readdir(targetDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(targetDir, entry.name);
      if (entry.isDirectory()) {
        return listFilesRelative(baseDir, entryPath);
      }
      if (entry.isFile()) {
        return [path.relative(baseDir, entryPath)];
      }
      return [];
    }),
  );

  return files.flat();
}

function createOutput(json: boolean, write: (line: string) => void): (event: MatrixStartedEvent | LaneCompletedEvent | DemoMatrixResult) => void {
  if (json) {
    return (event) => write(`${JSON.stringify(event)}\n`);
  }

  return (event) => {
    if (event.event === "matrix_started") {
      write(`demo-matrix: ${event.mode} ${event.lanes.length} lane(s), workdir ${event.working_dir}\n`);
      return;
    }
    if (event.event === "lane_completed") {
      write(`demo-matrix: ${event.result.slug} ${event.result.status} (${event.result.duration_ms}ms)\n`);
      return;
    }
    write(
      `demo-matrix: ${event.status}; ${event.success_count} completed, ${event.failure_count} failed` +
        `${event.kept_workdir ? `; kept ${event.working_dir}` : ""}\n`,
    );
  };
}

function eventStatus(result: SpawnResult): string {
  const status = result.lastEvent?.status;
  if (typeof status === "string" && status.length > 0) {
    return status;
  }

  return result.exitCode === 0 ? "unknown" : "failed";
}

async function resolveStarterSampleSupport(repoRoot: string, show: Record<string, unknown>, defaultPipeline: string): Promise<SampleSupport> {
  const showSupport = sampleSupportValue(show.sample_support);
  if (showSupport !== undefined) {
    return showSupport;
  }

  const pipelinePath = path.join(repoRoot, "bundled", "pipelines", `${defaultPipeline}.yaml`);
  const pipeline = await readYamlRecord(pipelinePath);
  return sampleSupportValue(pipeline.sample_support) ?? "unsupported";
}

function defaultPipelineSlug(show: Record<string, unknown>, showPath: string): string {
  if (isRecord(show.defaults) && typeof show.defaults.pipeline === "string") {
    return show.defaults.pipeline;
  }

  if (isRecord(show.pipelines)) {
    const first = Object.keys(show.pipelines).sort((left, right) => left.localeCompare(right))[0];
    if (first !== undefined) {
      return first;
    }
  }

  throw new Error(`starter show has no default pipeline: ${showPath}`);
}

function sampleSupportAllows(support: SampleSupport, mode: DemoMatrixMode): boolean {
  if (mode === "paid-demo") {
    return support === "paid" || support === "both";
  }

  return support === "zero-key" || support === "both";
}

function sampleSupportValue(value: unknown): SampleSupport | undefined {
  if (value === "zero-key" || value === "paid" || value === "both" || value === "unsupported") {
    return value;
  }

  return undefined;
}

async function directoryNames(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right));
}

async function readYamlRecord(filePath: string): Promise<Record<string, unknown>> {
  const parsed = YAML.parse(await readFile(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`expected YAML object at ${filePath}`);
  }

  return parsed;
}

function stringField(record: Record<string, unknown>, field: string, fallback: string): string {
  const value = record[field];
  return typeof value === "string" && value.length > 0 ? value : fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function findRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function usageText(): string {
  return [
    "Usage: pnpm demo-matrix [--zero-key | --paid-demo] [--only <slug>...] [--keep-workdir] [--json] [--cli-path <path>]",
    "",
    "Runs bundled starter sample builds in fresh temp user projects outside the harness repo.",
  ].join("\n");
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  try {
    const result = await runDemoMatrix({ argv });
    process.exitCode = result.exitCode;
  } catch (error) {
    const exitCode = error instanceof UsageError ? error.exitCode : 1;
    process.stderr.write(error instanceof Error ? `${error.message}\n` : `${String(error)}\n`);
    process.exitCode = exitCode;
  }
}

const entrypoint = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : undefined;
if (entrypoint === import.meta.url && process.env.VITEST_WORKER_ID === undefined) {
  await main();
}
