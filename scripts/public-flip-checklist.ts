#!/usr/bin/env tsx

import { spawn } from "node:child_process";
import { constants } from "node:fs";
import { access, readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FORBIDDEN_TRACKED_PATHS,
  SIBLING_REPO_GREP_EXCLUDES,
  SIBLING_REPO_PATH_NEEDLES,
} from "./lib/sibling-repo-paths.ts";

const defaultShellTimeoutMs = 10 * 60 * 1000;

export type PublicFlipCheckStatus = "pass" | "fail" | "skip";

export type PublicFlipCheck = {
  readonly id:
    | "migration-removed"
    | "no-sibling-paths"
    | "license-apache-2"
    | "readme-complete"
    | "changelog-v0.1.0"
    | "bundled-runnable-example"
    | "watch-import-fixture"
    | "pnpm-green"
    | "pre-release-issues-clear";
  readonly label: string;
  readonly status: PublicFlipCheckStatus;
  readonly detail: string;
};

export type PublicFlipChecklistResult = {
  readonly passed: boolean;
  readonly checks: readonly PublicFlipCheck[];
};

export type ShellResult = {
  readonly status: number;
  readonly stdout: string;
  readonly stderr: string;
};

export type RunShell = (
  command: string,
  args: readonly string[],
  options: { readonly cwd: string },
) => Promise<ShellResult>;

export type PublicFlipChecklistOptions = {
  readonly repoRoot?: string;
  readonly runShell?: RunShell;
  readonly skipBuild?: boolean;
  readonly skipE2E?: boolean;
};

type CheckDefinition = {
  readonly id: PublicFlipCheck["id"];
  readonly label: string;
  readonly run: () => Promise<Pick<PublicFlipCheck, "status" | "detail">>;
};

export async function runPublicFlipChecklist(
  options: PublicFlipChecklistOptions = {},
): Promise<PublicFlipChecklistResult> {
  const repoRoot = path.resolve(options.repoRoot ?? process.cwd());
  const runShell = options.runShell ?? defaultRunShell;
  const skipBuild = options.skipBuild ?? true;
  const skipE2E = options.skipE2E ?? true;

  const definitions: readonly CheckDefinition[] = [
    {
      id: "migration-removed",
      label: ".migration removed",
      run: () => checkMigrationRemoved(repoRoot, runShell),
    },
    {
      id: "no-sibling-paths",
      label: "No sibling-repo path names",
      run: () => checkSiblingRepoNeedles(repoRoot, runShell),
    },
    {
      id: "license-apache-2",
      label: "Apache 2.0 license",
      run: () => checkLicense(repoRoot),
    },
    {
      id: "readme-complete",
      label: "README complete",
      run: () => checkReadme(repoRoot),
    },
    {
      id: "changelog-v0.1.0",
      label: "CHANGELOG v0.1.0",
      run: () => checkChangelog(repoRoot),
    },
    {
      id: "bundled-runnable-example",
      label: "Bundled runnable example",
      run: () => checkBundledRunnableExample(repoRoot, runShell, skipE2E),
    },
    {
      id: "watch-import-fixture",
      label: "Watch/import fixture",
      run: () => checkWatchImportFixture(repoRoot),
    },
    {
      id: "pnpm-green",
      label: "pnpm install/build/test",
      run: () => checkPnpmGreen(repoRoot, runShell, skipBuild),
    },
    {
      id: "pre-release-issues-clear",
      label: "Pre-release issues clear",
      run: async () => ({
        status: "skip",
        detail: "Manual GitHub check: gh issue list --milestone pre-release --state open",
      }),
    },
  ];

  const checks: PublicFlipCheck[] = [];
  for (const definition of definitions) {
    try {
      checks.push({
        id: definition.id,
        label: definition.label,
        ...(await definition.run()),
      });
    } catch (error) {
      checks.push({
        id: definition.id,
        label: definition.label,
        status: "fail",
        detail: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return {
    passed: checks.every((check) => check.status !== "fail"),
    checks,
  };
}

async function checkMigrationRemoved(repoRoot: string, runShell: RunShell): Promise<CheckResult> {
  const failures: string[] = [];

  for (const forbiddenPath of FORBIDDEN_TRACKED_PATHS) {
    const normalizedPath = forbiddenPath.replace(/\/+$/u, "");
    if (await exists(path.join(repoRoot, normalizedPath))) {
      failures.push(`${forbiddenPath} exists on disk`);
    }

    const tracked = await runGit(runShell, repoRoot, ["ls-files", "--", normalizedPath]);
    if (tracked.status !== 0) {
      return fail(`git ls-files failed for ${forbiddenPath}: ${formatShellFailure(tracked)}`);
    }

    const trackedPaths = tracked.stdout.trim();
    if (trackedPaths.length > 0) {
      failures.push(`tracked paths for ${forbiddenPath}: ${trackedPaths}`);
    }
  }

  if (failures.length > 0) {
    return fail(failures.join("; "));
  }

  return pass(`${FORBIDDEN_TRACKED_PATHS.join(", ")} absent on disk and not tracked`);
}

async function checkSiblingRepoNeedles(repoRoot: string, runShell: RunShell): Promise<CheckResult> {
  const hits: string[] = [];

  for (const needle of SIBLING_REPO_PATH_NEEDLES) {
    const grep = await runGit(runShell, repoRoot, [
      "grep",
      "-l",
      "--fixed-strings",
      "-e",
      needle,
      "--",
      ".",
      ...SIBLING_REPO_GREP_EXCLUDES.map((filePath) => `:!${filePath}`),
    ]);

    if (grep.status === 1) {
      continue;
    }
    if (grep.status !== 0) {
      return fail(`git grep failed for ${JSON.stringify(needle)}: ${formatShellFailure(grep)}`);
    }

    const files = grep.stdout
      .trim()
      .split(/\n/u)
      .map((filePath) => filePath.trim())
      .filter(Boolean)
      .map((filePath) => `${needle}: ${filePath}`);
    hits.push(...files);
  }

  if (hits.length > 0) {
    return fail(hits.join("; "));
  }

  return pass(`No hits for ${SIBLING_REPO_PATH_NEEDLES.length} forbidden needles outside release docs`);
}

async function checkLicense(repoRoot: string): Promise<CheckResult> {
  const license = await readFile(path.join(repoRoot, "LICENSE"), "utf8");
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as {
    license?: unknown;
  };
  const licenseHeader = license.split(/\n/u).slice(0, 5).join("\n");

  if (!licenseHeader.includes("Apache License") || !licenseHeader.includes("Version 2.0")) {
    return fail("LICENSE does not start with Apache License Version 2.0");
  }

  if (packageJson.license !== "Apache-2.0") {
    return fail("package.json license must be Apache-2.0");
  }

  return pass("LICENSE and package.json declare Apache-2.0");
}

async function checkReadme(repoRoot: string): Promise<CheckResult> {
  const readme = await readFile(path.join(repoRoot, "README.md"), "utf8");
  const requiredHeadings = [
    "## Install",
    "## 60-Second Quickstart",
    "## Features",
    "## CLI Surface",
    "## License",
  ];
  const missingHeadings = requiredHeadings.filter((heading) => !readme.includes(heading));
  if (missingHeadings.length > 0) {
    return fail(`Missing README headings: ${missingHeadings.join(", ")}`);
  }

  const requiredPhrases = ["Node 22", "pnpm 9", "ffmpeg", "predit init", "predit build", "--sample"];
  const missingPhrases = requiredPhrases.filter((phrase) => !readme.includes(phrase));
  if (missingPhrases.length > 0) {
    return fail(`README required content is missing: ${missingPhrases.join(", ")}`);
  }

  return pass("README includes purpose, requirements, install, quickstart, CLI surface, and license");
}

async function checkChangelog(repoRoot: string): Promise<CheckResult> {
  const changelog = await readFile(path.join(repoRoot, "CHANGELOG.md"), "utf8");
  if (!/^##\s*\[?0\.1\.0\]?/mu.test(changelog)) {
    return fail("CHANGELOG.md is missing a v0.1.0 entry");
  }

  return pass("CHANGELOG.md contains a v0.1.0 entry");
}

async function checkBundledRunnableExample(
  repoRoot: string,
  runShell: RunShell,
  skipE2E: boolean,
): Promise<CheckResult> {
  const startersRoot = path.join(repoRoot, "bundled", "starters");
  const entries = await readdir(startersRoot, { withFileTypes: true });
  const runnableStarters: string[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const starterDir = path.join(startersRoot, entry.name);
    const hasShow = await exists(path.join(starterDir, "show.yaml"));
    const hasSampleEpisode = await exists(path.join(starterDir, "episodes", "sample-episode.yaml"));
    if (hasShow && hasSampleEpisode) {
      runnableStarters.push(entry.name);
    }
  }

  if (runnableStarters.length === 0) {
    return fail("No bundled starter contains show.yaml and episodes/sample-episode.yaml");
  }

  if (skipE2E) {
    return pass(
      `${runnableStarters.length} starter(s) have sample episodes; E2E execution is covered by tests/smoke/framework-smoke.test.ts`,
    );
  }

  const smoke = await runPnpm(runShell, repoRoot, ["run", "test:smoke"]);
  if (smoke.status !== 0) {
    return fail(`pnpm run test:smoke failed: ${formatShellFailure(smoke)}`);
  }

  return pass(`${runnableStarters.length} starter(s) have sample episodes and smoke test passed`);
}

async function checkWatchImportFixture(repoRoot: string): Promise<CheckResult> {
  const fixtureRoot = path.join(repoRoot, "bundled", "fixtures", "ingest-watch", "thechaosfm-news", "pilot");
  const requiredFiles = ["track.mp3", "lyrics.txt", "sources.yaml", "reference.mp4"];
  const missingFiles: string[] = [];

  for (const fileName of requiredFiles) {
    const filePath = path.join(fixtureRoot, fileName);
    if (!(await isFile(filePath))) {
      missingFiles.push(path.relative(repoRoot, filePath));
    }
  }

  if (missingFiles.length > 0) {
    return fail(`Missing ingest-watch fixture files: ${missingFiles.join(", ")}`);
  }

  const importTest = await readFile(path.join(repoRoot, "src", "cli", "commands", "import.test.ts"), "utf8");
  const watchTest = await readFile(path.join(repoRoot, "src", "cli", "commands", "watch.test.ts"), "utf8");
  if (!importTest.includes("bundled/fixtures/ingest-watch") || !watchTest.includes("bundled/fixtures/ingest-watch")) {
    return fail("import/watch tests do not reference bundled/fixtures/ingest-watch");
  }

  return pass("bundled/fixtures/ingest-watch backs import and watch tests");
}

async function checkPnpmGreen(repoRoot: string, runShell: RunShell, skipBuild: boolean): Promise<CheckResult> {
  if (skipBuild) {
    return skip("Skipped by default; run pnpm release:check:full to execute install, build, and test");
  }

  for (const args of [
    ["install", "--frozen-lockfile"],
    ["build"],
    ["test"],
  ] as const) {
    const result = await runPnpm(runShell, repoRoot, args);
    if (result.status !== 0) {
      return fail(`pnpm ${args.join(" ")} failed: ${formatShellFailure(result)}`);
    }
  }

  return pass("pnpm install --frozen-lockfile, pnpm build, and pnpm test passed");
}

async function runGit(runShell: RunShell, cwd: string, args: readonly string[]): Promise<ShellResult> {
  return runShell("git", args, { cwd });
}

async function runPnpm(runShell: RunShell, cwd: string, args: readonly string[]): Promise<ShellResult> {
  return runShell("pnpm", args, { cwd });
}

async function defaultRunShell(
  command: string,
  args: readonly string[],
  options: { readonly cwd: string },
): Promise<ShellResult> {
  return new Promise((resolve) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: { ...process.env, CI: process.env.CI ?? "1" },
      shell: process.platform === "win32",
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const timer = setTimeout(() => {
      settled = true;
      child.kill("SIGTERM");
      resolve({
        status: 124,
        stdout,
        stderr: `${stderr.trim()}\n${command} ${args.join(" ")} timed out`.trim(),
      });
    }, defaultShellTimeoutMs);

    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      resolve({ status: 1, stdout, stderr: error.message });
    });
    child.on("close", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      const status = code ?? (signal === null ? 1 : 128);
      resolve({ status, stdout, stderr });
    });
  });
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isFile(filePath: string): Promise<boolean> {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

type CheckResult = Pick<PublicFlipCheck, "status" | "detail">;

function pass(detail: string): CheckResult {
  return { status: "pass", detail };
}

function fail(detail: string): CheckResult {
  return { status: "fail", detail };
}

function skip(detail: string): CheckResult {
  return { status: "skip", detail };
}

function formatShellFailure(result: ShellResult): string {
  const output = [result.stderr.trim(), result.stdout.trim()].filter(Boolean).join("\n").trim();
  return output.length > 0 ? output : `exit ${result.status}`;
}

function renderMarkdownTable(result: PublicFlipChecklistResult): string {
  const lines = ["| Check | Status | Detail |", "|---|---|---|"];
  for (const check of result.checks) {
    lines.push(`| \`${check.id}\` | ${check.status} | ${escapeMarkdownTableCell(check.detail)} |`);
  }
  return lines.join("\n");
}

function escapeMarkdownTableCell(value: string): string {
  return value.replaceAll("|", "\\|").replace(/\s+/gu, " ").trim();
}

function parseCliArgs(args: readonly string[]): { readonly json: boolean; readonly withBuild: boolean; readonly withE2E: boolean } {
  const flags = new Set(args);
  const knownFlags = new Set(["--json", "--with-build", "--with-e2e", "--help", "-h"]);

  for (const arg of args) {
    if (!knownFlags.has(arg)) {
      throw new Error(`Unknown option: ${arg}`);
    }
  }

  if (flags.has("--help") || flags.has("-h")) {
    console.log(
      [
        "Usage: tsx scripts/public-flip-checklist.ts [--json] [--with-build] [--with-e2e]",
        "",
        "Runs the public-flip checklist gate from specs/01-repo-and-licensing.md.",
      ].join("\n"),
    );
    process.exit(0);
  }

  return {
    json: flags.has("--json"),
    withBuild: flags.has("--with-build"),
    withE2E: flags.has("--with-e2e"),
  };
}

async function main(): Promise<void> {
  const flags = parseCliArgs(process.argv.slice(2));
  const result = await runPublicFlipChecklist({
    repoRoot: process.cwd(),
    skipBuild: !flags.withBuild,
    skipE2E: !flags.withE2E,
  });

  if (flags.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(renderMarkdownTable(result));
  }

  if (!result.passed) {
    process.exit(1);
  }
}

const invokedPath = process.argv[1] === undefined ? "" : path.resolve(process.argv[1]);
if (invokedPath === fileURLToPath(import.meta.url)) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
