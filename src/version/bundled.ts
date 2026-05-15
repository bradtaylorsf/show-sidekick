import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { cp, mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ErrorWithCode = Error & { code?: string };

export const BUNDLED_CACHE_DIRS = ["pipelines", "playbooks", "skills", "schemas", "starters"] as const;

export type BundledCacheDir = (typeof BUNDLED_CACHE_DIRS)[number];

export function bundledRoot(): string {
  let current = path.dirname(fileURLToPath(import.meta.url));

  while (true) {
    const candidate = path.join(current, "bundled");
    if (isDirectorySync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new Error(`Could not locate bundled/ from ${path.dirname(fileURLToPath(import.meta.url))}`);
    }

    current = parent;
  }
}

export async function copyBundledInto(targetPreditDir: string, sourceBundledRoot: string = bundledRoot()): Promise<void> {
  await mkdir(targetPreditDir, { recursive: true });

  for (const dirname of BUNDLED_CACHE_DIRS) {
    const source = path.join(sourceBundledRoot, dirname);
    const target = path.join(targetPreditDir, dirname);

    if (!(await exists(source))) {
      await mkdir(target, { recursive: true });
      continue;
    }

    await cp(source, target, { recursive: true, force: true });
  }

  await materializeAgentNativeSkillFolders(path.join(targetPreditDir, "skills"));
}

export async function computeBundledChecksum(sourceBundledRoot: string = bundledRoot()): Promise<string> {
  const files = await collectBundledFiles(sourceBundledRoot);
  const digest = createHash("sha256");

  for (const file of files) {
    const content = await readFile(path.join(sourceBundledRoot, file));
    const contentDigest = createHash("sha256").update(content).digest("hex");
    digest.update(file);
    digest.update("\0");
    digest.update(contentDigest);
    digest.update("\0");
  }

  return digest.digest("hex");
}

async function collectBundledFiles(sourceBundledRoot: string): Promise<string[]> {
  const files: string[] = [];

  for (const dirname of BUNDLED_CACHE_DIRS) {
    const absoluteDir = path.join(sourceBundledRoot, dirname);
    if (!(await exists(absoluteDir))) {
      continue;
    }

    await collectFiles(absoluteDir, dirname, files);
  }

  return files.sort((left, right) => left.localeCompare(right));
}

async function collectFiles(absoluteDir: string, relativeDir: string, files: string[]): Promise<void> {
  const entries = (await readdir(absoluteDir, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  for (const entry of entries) {
    const absolutePath = path.join(absoluteDir, entry.name);
    const relativePath = path.join(relativeDir, entry.name).split(path.sep).join("/");

    if (entry.isDirectory()) {
      await collectFiles(absolutePath, relativePath, files);
      continue;
    }

    if (entry.isFile()) {
      files.push(relativePath);
    }
  }
}

async function materializeAgentNativeSkillFolders(skillsDir: string): Promise<void> {
  if (!(await exists(skillsDir))) {
    return;
  }

  await materializeSkillFolders(skillsDir);
}

async function materializeSkillFolders(dir: string): Promise<void> {
  const entries = (await readdir(dir, { withFileTypes: true })).sort((left, right) =>
    left.name.localeCompare(right.name),
  );

  for (const entry of entries) {
    const absolutePath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      if (!isReferenceMaterialDirectory(entry.name)) {
        await materializeSkillFolders(absolutePath);
      }
      continue;
    }

    if (!entry.isFile() || !entry.name.endsWith(".md") || isNonSkillMarkdown(entry.name)) {
      continue;
    }

    const content = await readFile(absolutePath, "utf8");
    if (!hasSkillFrontmatter(content)) {
      continue;
    }

    const skillDir = path.join(dir, path.basename(entry.name, ".md"));
    await mkdir(skillDir, { recursive: true });
    await writeFile(path.join(skillDir, "SKILL.md"), content, "utf8");
  }
}

function isReferenceMaterialDirectory(name: string): boolean {
  return new Set(["assets", "examples", "palettes", "references", "rules", "scripts", "templates"]).has(name);
}

function isNonSkillMarkdown(name: string): boolean {
  return name === "README.md" || name === "TEMPLATE.md" || name === "AGENTS.md";
}

function hasSkillFrontmatter(content: string): boolean {
  return /^---\n[\s\S]*?name:\s*['"]?[^'"\n]+['"]?[\s\S]*?\n---/u.test(content);
}

async function exists(targetPath: string): Promise<boolean> {
  try {
    await stat(targetPath);
    return true;
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

function isDirectorySync(targetPath: string): boolean {
  try {
    return existsSync(targetPath) && statSync(targetPath).isDirectory();
  } catch {
    return false;
  }
}
