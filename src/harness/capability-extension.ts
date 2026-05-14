import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

type SlugRef = string | { slug: string };

export type CapabilityExtensionKind = "script" | "tool" | "playbook" | "skill";

export type CapabilityExtension = {
  kind: CapabilityExtensionKind;
  name: string;
  path: string;
  isPaid: boolean;
};

export type CapabilityExtensions = {
  scripts: CapabilityExtension[];
  tools: CapabilityExtension[];
  playbooks: CapabilityExtension[];
  skills: CapabilityExtension[];
  all: CapabilityExtension[];
};

export type LoadCapabilityExtensionsOptions = {
  projectRoot: string;
  show: SlugRef;
  episode: SlugRef;
};

export async function loadCapabilityExtensions(
  options: LoadCapabilityExtensionsOptions,
): Promise<CapabilityExtensions> {
  const projectRoot = path.resolve(options.projectRoot);
  const show = slugOf(options.show);
  const episode = slugOf(options.episode);
  const episodeRoot = path.join(projectRoot, "projects", show, episode);

  const [scripts, tools, playbooks, skills] = await Promise.all([
    listExtensions(path.join(episodeRoot, "scripts"), "script", isScriptFile),
    listToolExtensions(path.join(episodeRoot, "tools")),
    listExtensions(path.join(projectRoot, "playbooks"), "playbook", isYamlFile),
    listExtensions(path.join(projectRoot, "shows", show, "skills"), "skill", isMarkdownFile),
  ]);

  return {
    scripts,
    tools,
    playbooks,
    skills,
    all: [...scripts, ...tools, ...playbooks, ...skills].sort(compareExtension),
  };
}

async function listExtensions(
  dir: string,
  kind: Exclude<CapabilityExtensionKind, "tool">,
  include: (name: string) => boolean,
): Promise<CapabilityExtension[]> {
  const entries = await safeReaddir(dir);

  return entries
    .filter((entry) => entry.isFile() && include(entry.name))
    .map((entry) => ({
      kind,
      name: extensionName(entry.name),
      path: path.join(dir, entry.name),
      isPaid: false,
    }))
    .sort(compareExtension);
}

async function listToolExtensions(dir: string): Promise<CapabilityExtension[]> {
  const entries = await safeReaddir(dir);
  const tools: CapabilityExtension[] = [];

  for (const entry of entries.filter((candidate) => candidate.isFile() && isToolModule(candidate.name))) {
    const absolutePath = path.join(dir, entry.name);
    tools.push({
      kind: "tool",
      name: extensionName(entry.name),
      path: absolutePath,
      isPaid: await isPaidToolModule(absolutePath),
    });
  }

  return tools.sort(compareExtension);
}

async function isPaidToolModule(filePath: string): Promise<boolean> {
  const imported = (await import(pathToFileURL(filePath).href)) as unknown;
  if (!isRecord(imported) || !isRecord(imported.default)) {
    return false;
  }

  const cost = imported.default.cost;
  return isRecord(cost) && typeof cost.usd === "number" && cost.usd > 0;
}

async function safeReaddir(dir: string): Promise<Dirent[]> {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

function isScriptFile(name: string): boolean {
  return !name.startsWith("_") && !name.endsWith(".tmp") && !name.endsWith(".map");
}

function isToolModule(name: string): boolean {
  if (name.startsWith("_")) {
    return false;
  }

  if (!(name.endsWith(".ts") || name.endsWith(".js"))) {
    return false;
  }

  return (
    !name.endsWith(".d.ts") &&
    !name.endsWith(".test.ts") &&
    !name.endsWith(".test.js") &&
    !name.endsWith(".spec.ts") &&
    !name.endsWith(".spec.js") &&
    name !== "index.ts" &&
    name !== "index.js"
  );
}

function isYamlFile(name: string): boolean {
  return name.endsWith(".yaml") || name.endsWith(".yml");
}

function isMarkdownFile(name: string): boolean {
  return name.endsWith(".md");
}

function extensionName(fileName: string): string {
  if (fileName.endsWith(".d.ts")) {
    return path.basename(fileName, ".d.ts");
  }

  return path.basename(fileName, path.extname(fileName));
}

function compareExtension(left: CapabilityExtension, right: CapabilityExtension): number {
  return left.kind.localeCompare(right.kind) || left.name.localeCompare(right.name) || left.path.localeCompare(right.path);
}

function slugOf(value: SlugRef): string {
  return typeof value === "string" ? value : value.slug;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
