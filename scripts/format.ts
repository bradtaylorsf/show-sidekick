import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const formatExtensions = new Set([".ts", ".tsx", ".mjs", ".json", ".md", ".yml", ".yaml"]);
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
]);

function main(): void {
  if (hasLocalBinary("prettier")) {
    const result = spawnSync("prettier", ["--write", "."], {
      cwd: repoRoot,
      shell: process.platform === "win32",
      stdio: "inherit",
    });

    process.exit(result.status ?? 1);
  }

  for (const filePath of walk(repoRoot)) {
    const original = readFileSync(filePath, "utf8");
    const formatted = `${original.replace(/[ \t]+$/gmu, "").replace(/\n*$/u, "")}\n`;
    if (formatted !== original) {
      writeFileSync(filePath, formatted, "utf8");
    }
  }

  console.log("format fallback completed");
}

function hasLocalBinary(name: string): boolean {
  return existsSync(path.join(repoRoot, "node_modules", ".bin", name));
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

    if (entry.isFile() && formatExtensions.has(path.extname(entry.name))) {
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
