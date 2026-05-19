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
  STALE_PUBLIC_NAME_GREP_TARGETS,
  STALE_PUBLIC_NAME_LINE_ALLOWLIST,
  STALE_PUBLIC_NAME_NEEDLES,
} from "./lib/sibling-repo-paths.ts";

const defaultShellTimeoutMs = 10 * 60 * 1000;

export type PublicFlipCheckStatus = "pass" | "fail" | "skip";

export type PublicFlipCheck = {
  readonly id:
    | "migration-removed"
    | "no-sibling-paths"
    | "no-stale-public-names"
    | "package-bin-rename"
    | "cache-dir-rename"
    | "env-prefix-rename"
    | "docs-links"
    | "provider-catalog"
    | "pack-manifest"
    | "packed-tarball-smoke"
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
  readonly allowLocalMigrationBridge?: boolean;
  readonly runShell?: RunShell;
  readonly skipBuild?: boolean;
  readonly skipE2E?: boolean;
  readonly stalePublicNameGrepTargets?: readonly string[];
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
  const allowLocalMigrationBridge = options.allowLocalMigrationBridge ?? false;
  const runShell = options.runShell ?? defaultRunShell;
  const skipBuild = options.skipBuild ?? true;
  const skipE2E = options.skipE2E ?? false;
  const stalePublicNameGrepTargets = options.stalePublicNameGrepTargets ?? STALE_PUBLIC_NAME_GREP_TARGETS;

  const definitions: readonly CheckDefinition[] = [
    {
      id: "migration-removed",
      label: ".migration removed",
      run: () => checkMigrationRemoved(repoRoot, runShell, allowLocalMigrationBridge),
    },
    {
      id: "no-sibling-paths",
      label: "No sibling-repo path names",
      run: () => checkSiblingRepoNeedles(repoRoot, runShell),
    },
    {
      id: "no-stale-public-names",
      label: "No stale public product names",
      run: () => checkStalePublicNames(repoRoot, runShell, stalePublicNameGrepTargets),
    },
    {
      id: "package-bin-rename",
      label: "Package and binary renamed",
      run: () => checkPackageBinRename(repoRoot),
    },
    {
      id: "cache-dir-rename",
      label: "Cache directory renamed",
      run: () => checkCacheDirRename(repoRoot, runShell),
    },
    {
      id: "env-prefix-rename",
      label: "Environment prefix renamed",
      run: () => checkEnvPrefixRename(repoRoot, runShell),
    },
    {
      id: "docs-links",
      label: "Docs links resolve",
      run: () => checkDocsLinks(repoRoot),
    },
    {
      id: "provider-catalog",
      label: "Provider catalog generated",
      run: () => checkProviderCatalog(repoRoot, runShell),
    },
    {
      id: "pack-manifest",
      label: "Packed package manifest",
      run: () => checkPackManifest(repoRoot, runShell),
    },
    {
      id: "packed-tarball-smoke",
      label: "Packed tarball smoke",
      run: () => checkPackedTarballSmoke(repoRoot, runShell, skipE2E),
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

async function checkMigrationRemoved(
  repoRoot: string,
  runShell: RunShell,
  allowLocalMigrationBridge: boolean,
): Promise<CheckResult> {
  const failures: string[] = [];
  const localBridgePaths: string[] = [];

  for (const forbiddenPath of FORBIDDEN_TRACKED_PATHS) {
    const normalizedPath = forbiddenPath.replace(/\/+$/u, "");
    if (await exists(path.join(repoRoot, normalizedPath))) {
      if (allowLocalMigrationBridge) {
        localBridgePaths.push(forbiddenPath);
      } else {
        failures.push(`${forbiddenPath} exists on disk`);
      }
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

  if (localBridgePaths.length > 0) {
    return pass(`${localBridgePaths.join(", ")} exists locally but is untracked; release:check remains strict`);
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

async function checkStalePublicNames(
  repoRoot: string,
  runShell: RunShell,
  grepTargets: readonly string[],
): Promise<CheckResult> {
  const hits: string[] = [];

  for (const needle of STALE_PUBLIC_NAME_NEEDLES) {
    const grep = await runGit(runShell, repoRoot, [
      "grep",
      "-n",
      "--fixed-strings",
      "-e",
      needle,
      "--",
      ...grepTargets,
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
      .map((hit) => parseGrepHit(hit, needle))
      .filter((hit): hit is GrepHit => hit !== undefined)
      .filter((hit) => !isAllowedStalePublicNameHit(hit))
      .map((hit) => `${hit.needle}: ${hit.filePath}:${hit.lineNumber}: ${hit.line}`);
    hits.push(...files);
  }

  if (hits.length > 0) {
    return fail(hits.join("; "));
  }

  return pass(`No stale public name hits across ${grepTargets.length} public target(s)`);
}

async function checkPackageBinRename(repoRoot: string): Promise<CheckResult> {
  const packageJson = JSON.parse(await readFile(path.join(repoRoot, "package.json"), "utf8")) as {
    name?: unknown;
    bin?: unknown;
  };
  const failures: string[] = [];

  if (packageJson.name !== "show-sidekick") {
    failures.push(`package.json name is ${JSON.stringify(packageJson.name)}; expected "show-sidekick"`);
  }

  const bin = packageJson.bin;
  if (bin === null || typeof bin !== "object" || Array.isArray(bin)) {
    failures.push("package.json bin must be an object with a showkick entry");
  } else {
    const binEntries = bin as Record<string, unknown>;
    if (binEntries.showkick !== "dist/cli/index.js" && binEntries.showkick !== "./dist/cli/index.js") {
      failures.push('package.json bin.showkick must point to "dist/cli/index.js"');
    }
    if (Object.hasOwn(binEntries, "predit")) {
      failures.push("package.json must not expose a predit binary");
    }
  }

  if (failures.length > 0) {
    return fail(failures.join("; "));
  }

  return pass("package.json publishes show-sidekick with the showkick binary");
}

async function checkCacheDirRename(repoRoot: string, runShell: RunShell): Promise<CheckResult> {
  const grepTargets = [
    "src",
    ":(exclude)src/**/*.test.ts",
    ":(exclude)src/*.test.ts",
    ":(exclude)src/**/__snapshots__/**",
    "bundled/templates",
    "bundled/skills",
    "docs",
    "README.md",
  ] as const;
  const hits = await grepDisallowedFixedString(repoRoot, runShell, ".predit", grepTargets);
  const requiredDocs = [
    ["README.md", ".show-sidekick/"],
    ["docs/quickstart.md", ".show-sidekick/"],
  ] as const;
  const missingDocs: string[] = [];

  for (const [filePath, token] of requiredDocs) {
    const content = await readFile(path.join(repoRoot, filePath), "utf8");
    if (!content.includes(token)) {
      missingDocs.push(`${filePath} missing ${token}`);
    }
  }

  const failures = [...hits, ...missingDocs];
  if (failures.length > 0) {
    return fail(failures.join("; "));
  }

  return pass("No .predit cache references remain in public/runtime targets and docs mention .show-sidekick/");
}

async function checkEnvPrefixRename(repoRoot: string, runShell: RunShell): Promise<CheckResult> {
  const grepTargets = [
    "src",
    ":(exclude)src/**/*.test.ts",
    ":(exclude)src/*.test.ts",
    ":(exclude)src/**/__snapshots__/**",
    "bundled/templates",
    "docs",
    "README.md",
    "CHANGELOG.md",
  ] as const;
  const hits = await grepDisallowedFixedString(repoRoot, runShell, "PREDIT_", grepTargets);
  const replacementHits = await runGit(runShell, repoRoot, [
    "grep",
    "-l",
    "--fixed-strings",
    "-e",
    "SHOW_SIDEKICK_",
    "--",
    ...grepTargets,
  ]);

  if (replacementHits.status !== 0 && replacementHits.status !== 1) {
    return fail(`git grep failed for "SHOW_SIDEKICK_": ${formatShellFailure(replacementHits)}`);
  }

  if (replacementHits.status === 1) {
    hits.push("SHOW_SIDEKICK_ is not used in env docs, templates, or registry code");
  }

  if (hits.length > 0) {
    return fail(hits.join("; "));
  }

  return pass("Environment variables use SHOW_SIDEKICK_ with no disallowed PREDIT_ references");
}

async function checkDocsLinks(repoRoot: string): Promise<CheckResult> {
  const docsRoot = path.join(repoRoot, "docs");
  const markdownFiles = [path.join(repoRoot, "README.md"), ...(await listMarkdownFiles(docsRoot))];
  const failures: string[] = [];

  for (const filePath of markdownFiles) {
    const content = await readFile(filePath, "utf8");
    const links = markdownLinks(content);
    for (const link of links) {
      const targetPath = linkTargetPath(link);
      if (targetPath === null) {
        continue;
      }

      const resolved = path.resolve(path.dirname(filePath), targetPath);
      if (!isInsideOrEqual(resolved, repoRoot)) {
        failures.push(`${path.relative(repoRoot, filePath)} links outside repo: ${link}`);
        continue;
      }

      if (!(await exists(resolved))) {
        failures.push(`${path.relative(repoRoot, filePath)} has missing link target: ${link}`);
      }
    }
  }

  if (failures.length > 0) {
    return fail(failures.join("; "));
  }

  return pass(`Resolved relative markdown links in ${markdownFiles.length} README/docs file(s)`);
}

async function checkProviderCatalog(repoRoot: string, runShell: RunShell): Promise<CheckResult> {
  const result = await runPnpm(runShell, repoRoot, ["run", "docs:providers:check"]);
  if (result.status !== 0) {
    return fail(`pnpm run docs:providers:check failed: ${formatShellFailure(result)}`);
  }

  return pass("docs/providers.md matches the generated provider catalog");
}

async function checkPackManifest(repoRoot: string, runShell: RunShell): Promise<CheckResult> {
  const result = await runShell("npm", ["pack", "--dry-run", "--json"], { cwd: repoRoot });
  if (result.status !== 0) {
    return fail(`npm pack --dry-run --json failed: ${formatShellFailure(result)}`);
  }

  const packageFiles = parsePackFileList(result.stdout);
  if (packageFiles.length === 0) {
    return fail("npm pack --dry-run --json did not report any package files");
  }

  const requiredEntries: Array<{ readonly label: string; readonly matches: (filePath: string) => boolean }> = [
    { label: "dist/", matches: (filePath) => filePath.startsWith("dist/") },
    { label: "dist/cli/index.js", matches: (filePath) => filePath === "dist/cli/index.js" },
    { label: "bundled/", matches: (filePath) => filePath.startsWith("bundled/") },
    { label: "bundled/templates/", matches: (filePath) => filePath.startsWith("bundled/templates/") },
    { label: "bundled/schemas/", matches: (filePath) => filePath.startsWith("bundled/schemas/") },
    { label: "bundled/pipelines/", matches: (filePath) => filePath.startsWith("bundled/pipelines/") },
    { label: "bundled/starters/", matches: (filePath) => filePath.startsWith("bundled/starters/") },
    { label: "docs/", matches: (filePath) => filePath.startsWith("docs/") },
    { label: "README.md", matches: (filePath) => filePath === "README.md" },
    { label: "CHANGELOG.md", matches: (filePath) => filePath === "CHANGELOG.md" },
    { label: "LICENSE", matches: (filePath) => filePath === "LICENSE" },
    { label: "package.json", matches: (filePath) => filePath === "package.json" },
  ];
  const missingEntries = requiredEntries
    .filter((entry) => !packageFiles.some((filePath) => entry.matches(filePath)))
    .map((entry) => entry.label);

  if (missingEntries.length > 0) {
    return fail(`npm pack is missing required package entries: ${missingEntries.join(", ")}`);
  }

  return pass(`npm pack dry-run includes ${packageFiles.length} file(s), including dist, bundled content, schemas, docs, and templates`);
}

async function checkPackedTarballSmoke(repoRoot: string, runShell: RunShell, skipE2E: boolean): Promise<CheckResult> {
  if (skipE2E) {
    return fail("Packed tarball smoke was skipped; the public launch gate must install and exercise the packed package");
  }

  const result = await runPnpm(runShell, repoRoot, ["run", "release:smoke:pack"]);
  if (result.status !== 0) {
    return fail(`pnpm run release:smoke:pack failed: ${formatShellFailure(result)}`);
  }

  return pass("Packed tarball installs globally and runs init/build/export from the installed package");
}

type GrepHit = {
  readonly needle: string;
  readonly filePath: string;
  readonly lineNumber: string;
  readonly line: string;
};

function parseGrepHit(hit: string, needle: string): GrepHit | undefined {
  const match = /^(?<filePath>.*?):(?<lineNumber>\d+):(?<line>.*)$/u.exec(hit);
  if (match?.groups === undefined) {
    return undefined;
  }

  return {
    needle,
    filePath: match.groups.filePath ?? "",
    lineNumber: match.groups.lineNumber ?? "",
    line: match.groups.line ?? "",
  };
}

function isAllowedStalePublicNameHit(hit: GrepHit): boolean {
  return STALE_PUBLIC_NAME_LINE_ALLOWLIST.some((allow) => {
    if (allow.filePath !== hit.filePath || allow.needle !== hit.needle) {
      return false;
    }

    return new RegExp(allow.linePattern, "u").test(hit.line.trim());
  });
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
    "## What It Does",
    "## Requirements",
    "## Quickstart",
    "## No-Key Starter",
    "## Paid Provider Upgrade",
    "## What Show Sidekick Can Make",
    "## Docs",
    "## License",
  ];
  const missingHeadings = requiredHeadings.filter((heading) => !readme.includes(heading));
  if (missingHeadings.length > 0) {
    return fail(`Missing README headings: ${missingHeadings.join(", ")}`);
  }

  const requiredPhrases = [
    "Node 22",
    "npm",
    "Git",
    "FFmpeg",
    "npx -y show-sidekick@latest init --starter animated-explainer --git",
    "showkick doctor --profile paid-demo",
    "showkick build animated-explainer/sample-episode --sample",
    "showkick export animated-explainer/sample-episode --target premiere",
  ];
  const missingPhrases = requiredPhrases.filter((phrase) => !readme.includes(phrase));
  if (missingPhrases.length > 0) {
    return fail(`README required content is missing: ${missingPhrases.join(", ")}`);
  }

  return pass("README includes purpose, requirements, quickstart, no-key path, paid upgrade, docs, and license");
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
    return fail("Starter E2E execution was skipped; the public-flip gate must run pnpm run test:smoke");
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

async function grepDisallowedFixedString(
  repoRoot: string,
  runShell: RunShell,
  needle: string,
  targets: readonly string[],
): Promise<string[]> {
  const grep = await runGit(runShell, repoRoot, [
    "grep",
    "-n",
    "--fixed-strings",
    "-e",
    needle,
    "--",
    ...targets,
  ]);

  if (grep.status === 1) {
    return [];
  }
  if (grep.status !== 0) {
    return [`git grep failed for ${JSON.stringify(needle)}: ${formatShellFailure(grep)}`];
  }

  return grep.stdout
    .trim()
    .split(/\n/u)
    .map((hit) => parseGrepHit(hit, needle))
    .filter((hit): hit is GrepHit => hit !== undefined)
    .filter((hit) => !isAllowedStalePublicNameHit(hit))
    .map((hit) => `${hit.needle}: ${hit.filePath}:${hit.lineNumber}: ${hit.line}`);
}

async function listMarkdownFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const filePath = path.join(root, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listMarkdownFiles(filePath)));
    } else if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(filePath);
    }
  }

  return files.sort();
}

function markdownLinks(content: string): string[] {
  const links: string[] = [];
  const markdownLinkPattern = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/gu;
  let match: RegExpExecArray | null;

  while ((match = markdownLinkPattern.exec(content)) !== null) {
    const link = match[1];
    if (link !== undefined) {
      links.push(link);
    }
  }

  return links;
}

function linkTargetPath(link: string): string | null {
  const trimmed = link.trim();
  if (
    trimmed === "" ||
    trimmed.startsWith("#") ||
    /^[a-z][a-z0-9+.-]*:/iu.test(trimmed)
  ) {
    return null;
  }

  const withoutFragment = trimmed.split("#", 1)[0] ?? "";
  if (withoutFragment === "") {
    return null;
  }

  return decodeURIComponent(withoutFragment);
}

function parsePackFileList(stdout: string): string[] {
  const parsed = JSON.parse(stdout.trim()) as unknown;
  const packuments = Array.isArray(parsed) ? parsed : [parsed];
  const files = new Set<string>();

  for (const packument of packuments) {
    if (packument === null || typeof packument !== "object") {
      continue;
    }

    const maybeFiles = (packument as { files?: unknown }).files;
    if (!Array.isArray(maybeFiles)) {
      continue;
    }

    for (const file of maybeFiles) {
      if (file === null || typeof file !== "object") {
        continue;
      }
      const packagePath = (file as { path?: unknown }).path;
      if (typeof packagePath === "string") {
        files.add(normalizePackagePath(packagePath));
      }
    }
  }

  return [...files].sort();
}

function normalizePackagePath(filePath: string): string {
  return filePath.replace(/\\/gu, "/").replace(/^package\//u, "").replace(/^\.?\//u, "");
}

function isInsideOrEqual(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
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
