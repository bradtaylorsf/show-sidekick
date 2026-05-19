import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { upsertGitHubPrComment } from "./github-pr-comment.ts";

const repoRoot = process.cwd();
const migrationDir = path.join(repoRoot, ".migration");
const auditMapPath = path.join(migrationDir, "audit-map.json");
const issueRefPattern = /\b[A-Z][A-Z0-9]*-\d+\b/gu;
const defaultIgnoredSegments = new Set([".git", "node_modules", "dist"]);

type DriftReport = {
  readonly title: string;
  readonly items: readonly string[];
};

async function main(): Promise<void> {
  if (!existsSync(migrationDir)) {
    console.log("coverage drift audit skipped: .migration is absent");
    return;
  }

  const drift = await auditCoverageDrift();
  if (drift.length === 0) {
    console.log("coverage drift audit passed");
    return;
  }

  const body = renderDriftComment("Coverage Drift", drift);
  console.error(body);
  await tryComment("<!-- predit:coverage-drift -->", body);
  process.exit(1);
}

async function auditCoverageDrift(): Promise<DriftReport[]> {
  if (!existsSync(auditMapPath)) {
    return [{ title: "Missing audit map", items: [".migration/audit-map.json was not found."] }];
  }

  const implementationRefs = await readImplementationRefs();
  const auditMap = JSON.parse(await readFile(auditMapPath, "utf8")) as unknown;
  const auditRefs = collectIssueRefs(auditMap);
  const auditPaths = collectPathLikeStrings(auditMap);
  const ignoredPaths = collectIgnoredPaths(auditMap);
  const referenceFiles = await walkFiles(migrationDir);
  const drift: DriftReport[] = [];

  if (implementationRefs !== null) {
    const unknownRefs = [...auditRefs].filter((ref) => !implementationRefs.has(ref)).sort();
    if (unknownRefs.length > 0) {
      drift.push({
        title: "Audit map references not present in retired implementation plan",
        items: unknownRefs,
      });
    }
  }

  const unmappedFiles = referenceFiles
    .map((filePath) => normalizeRelativePath(path.relative(migrationDir, filePath)))
    .filter((relativePath) => !isIgnoredPath(relativePath, ignoredPaths))
    .filter((relativePath) => !isDocumentedByAuditMap(relativePath, auditPaths))
    .sort();

  if (unmappedFiles.length > 0) {
    drift.push({
      title: "Reference files not present in audit map",
      items: unmappedFiles,
    });
  }

  return drift;
}

async function readImplementationRefs(): Promise<Set<string> | null> {
  const implementationPath = path.join(repoRoot, ["IMPLEMENTATION", "md"].join("."));
  if (!existsSync(implementationPath)) {
    return null;
  }

  return collectIssueRefs(await readFile(implementationPath, "utf8"));
}

function collectIssueRefs(value: unknown): Set<string> {
  const refs = new Set<string>();

  for (const text of collectStrings(value)) {
    for (const match of text.matchAll(issueRefPattern)) {
      refs.add(match[0]);
    }
  }

  return refs;
}

function collectPathLikeStrings(value: unknown): Set<string> {
  const paths = new Set<string>();

  for (const text of collectStrings(value)) {
    if (!looksLikePath(text)) {
      continue;
    }

    paths.add(normalizeAuditPath(text));
  }

  return paths;
}

function collectIgnoredPaths(value: unknown): Set<string> {
  const ignored = new Set<string>();
  collectIgnoredPathsFromValue(value, ignored);
  return ignored;
}

function collectIgnoredPathsFromValue(value: unknown, ignored: Set<string>): void {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectIgnoredPathsFromValue(item, ignored);
    }
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, nested] of Object.entries(value)) {
    if (/^(ignore|ignored|ignored_paths|ignore_paths)$/u.test(key) && Array.isArray(nested)) {
      for (const item of nested) {
        if (typeof item === "string") {
          ignored.add(normalizeAuditPath(item));
        }
      }
      continue;
    }

    collectIgnoredPathsFromValue(nested, ignored);
  }
}

function collectStrings(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectStrings(item));
  }

  if (isRecord(value)) {
    return Object.entries(value).flatMap(([key, nested]) => [key, ...collectStrings(nested)]);
  }

  return [];
}

async function walkFiles(root: string): Promise<string[]> {
  const entries = await readdir(root, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const absolutePath = path.join(root, entry.name);
    const relativePath = normalizeRelativePath(path.relative(migrationDir, absolutePath));

    if (isIgnoredSegment(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      files.push(...(await walkFiles(absolutePath)));
      continue;
    }

    if (entry.isFile() && relativePath !== "audit-map.json") {
      files.push(absolutePath);
    }
  }

  return files;
}

function isDocumentedByAuditMap(relativePath: string, auditPaths: Set<string>): boolean {
  for (const auditPath of auditPaths) {
    if (relativePath === auditPath || relativePath.startsWith(`${auditPath}/`)) {
      return true;
    }
  }

  return false;
}

function isIgnoredPath(relativePath: string, ignoredPaths: Set<string>): boolean {
  for (const ignoredPath of ignoredPaths) {
    if (relativePath === ignoredPath || relativePath.startsWith(`${ignoredPath}/`)) {
      return true;
    }
  }

  return false;
}

function isIgnoredSegment(relativePath: string): boolean {
  return relativePath.split("/").some((segment) => defaultIgnoredSegments.has(segment));
}

function looksLikePath(value: string): boolean {
  return /[/\\]/u.test(value) || /\.[a-z0-9]{1,8}$/iu.test(value);
}

function normalizeAuditPath(value: string): string {
  const normalized = normalizeRelativePath(value);
  return normalized.startsWith(".migration/") ? normalized.slice(".migration/".length) : normalized;
}

function normalizeRelativePath(value: string): string {
  return value.replaceAll("\\", "/").replace(/^\.\/+/u, "").replace(/\/+$/u, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function renderDriftComment(title: string, drift: readonly DriftReport[]): string {
  const lines = [`## ${title}`, "", "Drift was detected by the CI audit gate.", ""];

  for (const section of drift) {
    lines.push(`### ${section.title}`);
    for (const item of section.items.slice(0, 100)) {
      lines.push(`- \`${item}\``);
    }
    if (section.items.length > 100) {
      lines.push(`- ...and ${section.items.length - 100} more`);
    }
    lines.push("");
  }

  return lines.join("\n").trimEnd();
}

async function tryComment(marker: string, body: string): Promise<void> {
  try {
    const commented = await upsertGitHubPrComment({ marker, body });
    if (commented) {
      console.error("updated GitHub PR drift comment");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`failed to update GitHub PR drift comment: ${message}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
