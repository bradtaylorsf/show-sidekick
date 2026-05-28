#!/usr/bin/env tsx

import { spawn } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type CommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

type PackageIdentity = {
  readonly name: string;
  readonly version: string;
};

type RunCommand = (command: string, args: readonly string[]) => Promise<CommandResult>;

export type ChangesetPrGateResult = {
  readonly status: "pass" | "fail";
  readonly reason: string;
  readonly exitCode: number;
};

export type ChangesetPrGateOptions = {
  readonly argv?: readonly string[];
  readonly eventPath?: string;
  readonly repoRoot?: string;
  readonly runCommand?: RunCommand;
  readonly write?: (line: string) => void;
  readonly writeError?: (line: string) => void;
};

class UsageError extends Error {
  readonly exitCode = 2;
}

export async function runChangesetPrGate(options: ChangesetPrGateOptions = {}): Promise<ChangesetPrGateResult> {
  const args = parseArgs(options.argv ?? []);
  const repoRoot = path.resolve(options.repoRoot ?? findRepoRoot());
  const runCommand = options.runCommand ?? defaultRunCommand;
  const write = options.write ?? ((line: string) => process.stdout.write(line));
  const writeError = options.writeError ?? ((line: string) => process.stderr.write(line));
  const event = await readPullRequestEvent(options.eventPath ?? process.env.GITHUB_EVENT_PATH);
  const baseRef = event.baseRef ?? "main";
  const since = args.since ?? `origin/${baseRef}`;

  if (event.labels.includes("no-release")) {
    const result = pass("no-release label present; skipping changeset requirement");
    write(`${result.reason}\n`);
    return result;
  }

  const status = await runCommand("pnpm", ["dlx", "@changesets/cli", "status", `--since=${since}`]);
  if (status.exitCode === 0) {
    const result = pass("changeset status passed");
    write(`${result.reason}\n`);
    return result;
  }

  const versionedRelease = await detectVersionedRelease({ repoRoot, runCommand, since });
  if (versionedRelease.ok) {
    const result = pass(versionedRelease.reason);
    write(`${result.reason}\n`);
    return result;
  }

  writeError(status.stdout);
  writeError(status.stderr);
  const result = fail(versionedRelease.reason);
  writeError(`${result.reason}\n`);
  return result;
}

function parseArgs(argv: readonly string[]): { readonly since: string | undefined } {
  let since: string | undefined;

  for (const arg of argv) {
    if (arg.startsWith("--since=")) {
      since = arg.slice("--since=".length);
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new UsageError(usageText());
    }
    throw new UsageError(`unknown option '${arg}'\n${usageText()}`);
  }

  return { since };
}

async function readPullRequestEvent(eventPath: string | undefined): Promise<{
  readonly baseRef: string | undefined;
  readonly labels: readonly string[];
}> {
  if (eventPath === undefined) {
    return { baseRef: undefined, labels: [] };
  }

  const event = JSON.parse(await readFile(eventPath, "utf8")) as {
    readonly pull_request?: {
      readonly base?: { readonly ref?: unknown };
      readonly labels?: readonly { readonly name?: unknown }[];
    };
  };
  const labels = event.pull_request?.labels ?? [];
  return {
    baseRef: typeof event.pull_request?.base?.ref === "string" ? event.pull_request.base.ref : undefined,
    labels: labels.flatMap((label) => (typeof label.name === "string" ? [label.name] : [])),
  };
}

async function detectVersionedRelease(options: {
  readonly repoRoot: string;
  readonly runCommand: RunCommand;
  readonly since: string;
}): Promise<{ readonly ok: boolean; readonly reason: string }> {
  const currentPackage = await readPackageIdentity(path.join(options.repoRoot, "package.json"));
  const basePackage = await readBasePackageIdentity(options.runCommand, options.since);

  if (basePackage.name !== currentPackage.name) {
    return { ok: false, reason: `package name changed from ${basePackage.name} to ${currentPackage.name}` };
  }
  if (basePackage.version === currentPackage.version) {
    return { ok: false, reason: "changeset status failed and package.json version was not bumped" };
  }

  const changesetFiles = await listPendingChangesetFiles(options.repoRoot);
  if (changesetFiles.length > 0) {
    return {
      ok: false,
      reason: `changeset status failed and pending changeset file(s) remain: ${changesetFiles.join(", ")}`,
    };
  }

  const changelog = await readFile(path.join(options.repoRoot, "CHANGELOG.md"), "utf8");
  if (!hasChangelogEntry(changelog, currentPackage.version)) {
    return {
      ok: false,
      reason: `changeset status failed and CHANGELOG.md has no ${currentPackage.version} release section`,
    };
  }

  return {
    ok: true,
    reason: `versioned release branch detected: ${currentPackage.name} ${basePackage.version} -> ${currentPackage.version}`,
  };
}

async function readPackageIdentity(packageJsonPath: string): Promise<PackageIdentity> {
  const packageJson = JSON.parse(await readFile(packageJsonPath, "utf8")) as {
    readonly name?: unknown;
    readonly version?: unknown;
  };
  if (typeof packageJson.name !== "string" || typeof packageJson.version !== "string") {
    throw new Error(`${packageJsonPath} must contain string name and version fields`);
  }
  return { name: packageJson.name, version: packageJson.version };
}

async function readBasePackageIdentity(runCommand: RunCommand, since: string): Promise<PackageIdentity> {
  const result = await runCommand("git", ["show", `${since}:package.json`]);
  if (result.exitCode !== 0) {
    throw new Error(`failed to read ${since}:package.json: ${result.stderr.trim() || result.stdout.trim()}`);
  }

  const packageJson = JSON.parse(result.stdout) as {
    readonly name?: unknown;
    readonly version?: unknown;
  };
  if (typeof packageJson.name !== "string" || typeof packageJson.version !== "string") {
    throw new Error(`${since}:package.json must contain string name and version fields`);
  }
  return { name: packageJson.name, version: packageJson.version };
}

async function listPendingChangesetFiles(repoRoot: string): Promise<readonly string[]> {
  const changesetDir = path.join(repoRoot, ".changeset");
  const entries = await readdir(changesetDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md") && entry.name !== "README.md")
    .map((entry) => path.join(".changeset", entry.name))
    .sort();
}

function hasChangelogEntry(changelog: string, version: string): boolean {
  const escapedVersion = version.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
  return new RegExp(`^## (?:\\[${escapedVersion}\\]|${escapedVersion})(?: - .*)?$`, "mu").test(changelog);
}

function pass(reason: string): ChangesetPrGateResult {
  return { status: "pass", reason, exitCode: 0 };
}

function fail(reason: string): ChangesetPrGateResult {
  return { status: "fail", reason, exitCode: 1 };
}

function defaultRunCommand(command: string, args: readonly string[]): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: process.cwd(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      resolve({ exitCode: code ?? 1, stdout, stderr });
    });
  });
}

function findRepoRoot(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

function usageText(): string {
  return [
    "Usage: pnpm changeset:gate [--since=<git-ref>]",
    "",
    "Requires a normal changeset, a no-release PR label, or a versioned release branch.",
  ].join("\n");
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  try {
    const result = await runChangesetPrGate({ argv });
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
