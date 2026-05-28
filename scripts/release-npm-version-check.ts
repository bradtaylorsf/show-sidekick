#!/usr/bin/env tsx

import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

type Expectation = "published" | "unpublished" | "none";

type PackageIdentity = {
  readonly name: string;
  readonly version: string;
};

type CommandResult = {
  readonly exitCode: number;
  readonly stdout: string;
  readonly stderr: string;
};

type RunCommand = (command: string, args: readonly string[]) => Promise<CommandResult>;

export type ReleaseNpmVersionCheckResult = {
  readonly packageName: string;
  readonly localVersion: string;
  readonly npmLatestVersion: string | undefined;
  readonly exactVersionPublished: boolean;
  readonly expectation: Expectation;
  readonly errors: readonly string[];
  readonly exitCode: number;
};

export type ReleaseNpmVersionCheckOptions = {
  readonly argv?: readonly string[];
  readonly packageJson?: PackageIdentity;
  readonly repoRoot?: string;
  readonly runCommand?: RunCommand;
  readonly write?: (line: string) => void;
};

class UsageError extends Error {
  readonly exitCode = 2;
}

export async function runReleaseNpmVersionCheck(
  options: ReleaseNpmVersionCheckOptions = {},
): Promise<ReleaseNpmVersionCheckResult> {
  const args = parseArgs(options.argv ?? []);
  const repoRoot = path.resolve(options.repoRoot ?? findRepoRoot());
  const packageJson = options.packageJson ?? (await readPackageIdentity(repoRoot));
  const runCommand = options.runCommand ?? defaultRunCommand;
  const write = options.write ?? ((line: string) => process.stdout.write(line));

  const npmLatestVersion = await npmViewVersion(runCommand, packageJson.name);
  const exactVersion = await npmViewVersion(runCommand, `${packageJson.name}@${packageJson.version}`);
  const exactVersionPublished = exactVersion === packageJson.version;
  const errors: string[] = [];

  if (args.expectation === "published") {
    if (!exactVersionPublished) {
      errors.push(`${packageJson.name}@${packageJson.version} is not published on npm`);
    }
    if (npmLatestVersion !== packageJson.version) {
      errors.push(
        `npm latest for ${packageJson.name} is ${formatVersion(npmLatestVersion)}; expected ${packageJson.version}`,
      );
    }
  }

  if (args.expectation === "unpublished" && exactVersionPublished) {
    errors.push(`${packageJson.name}@${packageJson.version} is already published on npm`);
  }

  const result: ReleaseNpmVersionCheckResult = {
    packageName: packageJson.name,
    localVersion: packageJson.version,
    npmLatestVersion,
    exactVersionPublished,
    expectation: args.expectation,
    errors,
    exitCode: errors.length === 0 ? 0 : 1,
  };

  if (args.json) {
    write(`${JSON.stringify(result)}\n`);
    return result;
  }

  write(`local package: ${packageJson.name}@${packageJson.version}\n`);
  write(`npm latest: ${formatVersion(npmLatestVersion)}\n`);
  write(`npm exact version: ${exactVersionPublished ? "published" : "not published"}\n`);

  if (errors.length > 0) {
    for (const error of errors) {
      write(`- ${error}\n`);
    }
  } else if (args.expectation !== "none") {
    write("release npm version check passed\n");
  }

  return result;
}

function parseArgs(argv: readonly string[]): { readonly expectation: Expectation; readonly json: boolean } {
  let expectation: Expectation = "none";
  let json = false;

  for (const arg of argv) {
    if (arg === "--expect-published") {
      expectation = setExpectation(expectation, "published");
      continue;
    }
    if (arg === "--expect-unpublished") {
      expectation = setExpectation(expectation, "unpublished");
      continue;
    }
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      throw new UsageError(usageText());
    }
    throw new UsageError(`unknown option '${arg}'\n${usageText()}`);
  }

  return { expectation, json };
}

function setExpectation(current: Expectation, next: Expectation): Expectation {
  if (current !== "none" && current !== next) {
    throw new UsageError("--expect-published and --expect-unpublished are mutually exclusive");
  }
  return next;
}

async function readPackageIdentity(repoRoot: string): Promise<PackageIdentity> {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as {
    readonly name?: unknown;
    readonly version?: unknown;
  };

  if (typeof packageJson.name !== "string" || typeof packageJson.version !== "string") {
    throw new Error("package.json must contain string name and version fields");
  }

  return { name: packageJson.name, version: packageJson.version };
}

async function npmViewVersion(runCommand: RunCommand, spec: string): Promise<string | undefined> {
  const result = await runCommand("npm", ["view", spec, "version", "--json"]);
  if (result.exitCode !== 0) {
    if (isNpmNotFound(result)) {
      return undefined;
    }
    throw new Error(`npm view ${spec} failed: ${result.stderr.trim() || result.stdout.trim() || result.exitCode}`);
  }

  return parseJsonVersion(result.stdout, spec);
}

function parseJsonVersion(stdout: string, spec: string): string | undefined {
  const trimmed = stdout.trim();
  if (trimmed.length === 0) {
    return undefined;
  }

  const parsed = JSON.parse(trimmed) as unknown;
  if (typeof parsed === "string") {
    return parsed;
  }
  if (parsed === null) {
    return undefined;
  }

  throw new Error(`npm view ${spec} returned non-string JSON`);
}

function isNpmNotFound(result: CommandResult): boolean {
  return /E404|404 Not Found|not found/iu.test(`${result.stderr}\n${result.stdout}`);
}

function formatVersion(version: string | undefined): string {
  return version ?? "not published";
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
    "Usage: pnpm release:verify:npm [--expect-published | --expect-unpublished] [--json]",
    "",
    "Compares package.json against the npm registry for the current package.",
  ].join("\n");
}

export async function main(argv: readonly string[] = process.argv.slice(2)): Promise<void> {
  try {
    const result = await runReleaseNpmVersionCheck({ argv });
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
