import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const lintExtensions = new Set([".ts", ".tsx", ".mjs", ".json", ".md", ".yml", ".yaml"]);
const ignoredSegments = new Set([
  ".alpha-loop",
  ".agents",
  ".claude",
  ".git",
  ".worktrees",
  "bundled/schemas",
  "bundled/skills/agents",
  "dist",
  "node_modules",
  "projects",
  "release-artifacts",
]);

function main(): void {
  if (hasLocalBinary("eslint") && hasLocalBinary("prettier")) {
    run("eslint", [".", "--ext", ".ts,.tsx,.mjs"], { ESLINT_USE_FLAT_CONFIG: "false" });
    run("prettier", ["--check", "."]);
    return;
  }

  const issues = fallbackLint();
  if (issues.length > 0) {
    for (const issue of issues) {
      console.error(issue);
    }
    process.exit(1);
  }

  console.log("lint fallback passed");
}

function hasLocalBinary(name: string): boolean {
  return existsSync(path.join(repoRoot, "node_modules", ".bin", name));
}

function run(command: string, args: string[], env: NodeJS.ProcessEnv = {}): void {
  const result = spawnSync(command, args, {
    cwd: repoRoot,
    env: { ...process.env, ...env },
    shell: process.platform === "win32",
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function fallbackLint(): string[] {
  const issues: string[] = [];

  for (const filePath of walk(repoRoot)) {
    const relativePath = path.relative(repoRoot, filePath);
    const text = readFileSync(filePath, "utf8");
    const lines = text.split(/\n/u);

    if (text.length > 0 && !text.endsWith("\n")) {
      issues.push(`${relativePath}: missing final newline`);
    }

    if (text.includes("\r")) {
      issues.push(`${relativePath}: contains CRLF line endings`);
    }

    lines.forEach((line, index) => {
      if (/[ \t]$/u.test(line)) {
        issues.push(`${relativePath}:${index + 1}: trailing whitespace`);
      }
    });

    if (path.extname(filePath) === ".json") {
      try {
        JSON.parse(text);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        issues.push(`${relativePath}: invalid JSON: ${message}`);
      }
    }
  }

  return issues;
}

function walk(root: string): string[] {
  const output: string[] = [];
  const entries = readdirSync(root, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    const relativePath = path.relative(repoRoot, absolutePath);

    if (isIgnored(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      output.push(...walk(absolutePath));
      continue;
    }

    if (entry.isFile() && lintExtensions.has(path.extname(entry.name))) {
      output.push(absolutePath);
    }
  }

  return output.filter((filePath) => statSync(filePath).isFile()).sort();
}

function isIgnored(relativePath: string): boolean {
  const normalized = relativePath.split(path.sep).join("/");
  return [...ignoredSegments].some((segment) => normalized === segment || normalized.startsWith(`${segment}/`));
}

main();
