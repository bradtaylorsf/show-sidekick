import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { projectPaths } from "../paths/project.js";
import { loadShow, type LoadedShow } from "./load.js";
import type { Show } from "./show.js";

type ErrorWithCode = Error & { code?: string };

export type IngestWatchEntry = NonNullable<Show["ingest"]>["watch"][number];

export type GlobMatcher = (relativePath: string) => boolean;

export type ShowIngestWatchEntry = {
  show: LoadedShow;
  watchEntry: IngestWatchEntry;
  absolutePath: string;
  matcher: GlobMatcher;
};

export type ResolvedDropMatch = ShowIngestWatchEntry & {
  matchedFilePath: string;
  matchedRelativePath: string;
};

export async function loadAllShowIngest(projectRoot: string): Promise<ShowIngestWatchEntry[]> {
  const showsRoot = projectPaths(projectRoot).shows;
  let entries;

  try {
    entries = await readdir(showsRoot, { withFileTypes: true });
  } catch (error) {
    const fileError = error as ErrorWithCode;
    if (fileError.code === "ENOENT") {
      return [];
    }
    throw error;
  }

  const watches: ShowIngestWatchEntry[] = [];

  for (const entry of entries.filter((candidate) => candidate.isDirectory()).sort(byName)) {
    const show = await loadShow(projectRoot, entry.name);
    watches.push(...showIngestWatchEntries(show));
  }

  return watches;
}

export function showIngestWatchEntries(show: LoadedShow): ShowIngestWatchEntry[] {
  return (show.ingest?.watch ?? []).map((watchEntry) => ({
    show,
    watchEntry,
    absolutePath: path.resolve(show.rootDir, watchEntry.path),
    matcher: compileGlobMatcher(watchEntry.match),
  }));
}

export function compileGlobMatcher(pattern: string): GlobMatcher {
  const source = globToRegExpSource(toPosixPath(pattern));
  const regex = new RegExp(`^${source}$`, "u");

  return (relativePath: string) => regex.test(toPosixPath(relativePath));
}

export function matchDropToWatch(
  absoluteDropPath: string,
  entries: readonly ShowIngestWatchEntry[],
): ShowIngestWatchEntry | null {
  const dropPath = path.resolve(absoluteDropPath);

  for (const entry of entries) {
    const relative = path.relative(entry.absolutePath, dropPath);
    if (!isRelativeChild(relative)) {
      continue;
    }

    if (entry.matcher(relative)) {
      return entry;
    }
  }

  return null;
}

export async function resolveDropMatch(
  absoluteDropPath: string,
  entries: readonly ShowIngestWatchEntry[],
): Promise<ResolvedDropMatch | null> {
  const dropPath = path.resolve(absoluteDropPath);
  const direct = toResolvedMatch(dropPath, entries);
  if (direct) {
    return direct;
  }

  const stats = await stat(dropPath).catch((error: ErrorWithCode) => {
    if (error.code === "ENOENT") {
      return null;
    }
    throw error;
  });

  if (!stats?.isDirectory()) {
    return null;
  }

  for await (const candidate of walkFiles(dropPath)) {
    const match = toResolvedMatch(candidate, entries);
    if (match) {
      return match;
    }
  }

  return null;
}

export function deriveSlug(dropAbsolutePath: string, watchEntry: IngestWatchEntry): string {
  const mode = watchEntry.slug_from ?? "parent_dir";

  if (mode === "parent_dir") {
    return path.basename(path.dirname(dropAbsolutePath));
  }

  if (mode === "filename") {
    return path.basename(dropAbsolutePath, path.extname(dropAbsolutePath));
  }

  if (mode === "prompt") {
    throw new Error("slug_from: prompt requires --slug");
  }

  throw new Error(`unsupported slug_from '${mode}'`);
}

export async function deriveInputs(
  dropAbsolutePath: string,
  entry: Pick<ShowIngestWatchEntry, "show">,
  options: { templateInputs?: Record<string, unknown> } = {},
): Promise<Record<string, string>> {
  const matchedFilePath = path.resolve(dropAbsolutePath);
  const siblingDir = path.dirname(matchedFilePath);
  const siblingFiles = await siblingInputFiles(siblingDir);
  const inputs: Record<string, string> = {};
  const usedPaths = new Set<string>();

  for (const [key, value] of Object.entries(options.templateInputs ?? {})) {
    if (typeof value !== "string" || !looksLikeFileInput(value)) {
      continue;
    }

    const matched = siblingFiles.find((candidate) => path.basename(candidate) === path.basename(value));
    if (matched === undefined) {
      continue;
    }

    addInput(inputs, key, matched, entry.show.projectRoot);
    usedPaths.add(path.normalize(matched));
  }

  for (const absolutePath of prioritizeMatchedFile(siblingFiles, matchedFilePath)) {
    if (usedPaths.has(path.normalize(absolutePath))) {
      continue;
    }

    addInput(inputs, inferInputKey(absolutePath, options.templateInputs), absolutePath, entry.show.projectRoot);
  }

  return inputs;
}

export function projectRelativePath(projectRoot: string, absolutePath: string): string {
  return toPosixPath(path.relative(projectRoot, absolutePath));
}

function toResolvedMatch(
  absoluteDropPath: string,
  entries: readonly ShowIngestWatchEntry[],
): ResolvedDropMatch | null {
  const entry = matchDropToWatch(absoluteDropPath, entries);
  if (!entry) {
    return null;
  }

  return {
    ...entry,
    matchedFilePath: path.resolve(absoluteDropPath),
    matchedRelativePath: toPosixPath(path.relative(entry.absolutePath, absoluteDropPath)),
  };
}

async function* walkFiles(root: string): AsyncGenerator<string> {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries.sort(byName)) {
    const absolutePath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      yield* walkFiles(absolutePath);
      continue;
    }

    if (entry.isFile()) {
      yield absolutePath;
    }
  }
}

async function siblingInputFiles(siblingDir: string): Promise<string[]> {
  const files = await readdir(siblingDir, { withFileTypes: true });
  return files
    .filter((candidate) => candidate.isFile())
    .sort(byName)
    .map((file) => path.join(siblingDir, file.name));
}

function prioritizeMatchedFile(files: string[], matchedFilePath: string): string[] {
  const normalizedMatch = path.normalize(matchedFilePath);
  return [
    ...files.filter((file) => path.normalize(file) === normalizedMatch),
    ...files.filter((file) => path.normalize(file) !== normalizedMatch),
  ];
}

function inferInputKey(filePath: string, templateInputs: Record<string, unknown> | undefined): string {
  const templateKey = inferTemplateInputKey(filePath, templateInputs);
  if (templateKey !== undefined) {
    return templateKey;
  }

  const extension = path.extname(filePath).toLowerCase();

  if ([".mp3", ".wav", ".m4a"].includes(extension)) {
    return "track";
  }

  if ([".pdf", ".ppt", ".pptx"].includes(extension)) {
    return "deck_source";
  }

  if ([".jpg", ".jpeg", ".png", ".gif"].includes(extension)) {
    return "reference_image";
  }

  if (extension === ".txt") {
    return "lyrics";
  }

  if ([".yaml", ".yml"].includes(extension)) {
    return "sources";
  }

  if ([".mp4", ".mov"].includes(extension)) {
    return "reference";
  }

  return "source";
}

function inferTemplateInputKey(filePath: string, templateInputs: Record<string, unknown> | undefined): string | undefined {
  const candidates = Object.entries(templateInputs ?? {})
    .filter(([, value]) => typeof value === "string" && looksLikeFileInput(value))
    .map(([key, value]) => ({ key, templatePath: value as string }))
    .filter(({ key, templatePath }) => inputKeyMatchesFile(key, templatePath, filePath));

  return candidates.length === 1 ? candidates[0]?.key : undefined;
}

function inputKeyMatchesFile(key: string, templatePath: string, filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  const templateExtension = path.extname(templatePath).toLowerCase();
  const keyTokens = key.split(/[_-]+/u);

  if ([".mp3", ".wav", ".m4a", ".aac", ".aiff"].includes(extension)) {
    return key === "track" || key.includes("audio") || key.includes("podcast") || sameInputFamily(extension, templateExtension);
  }

  if ([".mp4", ".mov", ".webm", ".mpeg"].includes(extension)) {
    return key.includes("video") || key === "source_media" || key === "reference" || sameInputFamily(extension, templateExtension);
  }

  if ([".pdf", ".ppt", ".pptx"].includes(extension)) {
    return key.includes("deck") || key.includes("presentation") || sameInputFamily(extension, templateExtension);
  }

  if ([".jpg", ".jpeg", ".png", ".gif"].includes(extension)) {
    return keyTokens.includes("image") || key === "screenshot" || key === "reference" || sameInputFamily(extension, templateExtension);
  }

  if ([".yaml", ".yml", ".json", ".csv", ".tsv"].includes(extension)) {
    return key === "sources" || sameInputFamily(extension, templateExtension);
  }

  if ([".txt", ".md", ".srt"].includes(extension)) {
    return sameInputFamily(extension, templateExtension);
  }

  return extension !== "" && extension === templateExtension;
}

function sameInputFamily(left: string, right: string): boolean {
  return inputFamily(left) !== "unknown" && inputFamily(left) === inputFamily(right);
}

function inputFamily(extension: string): string {
  if ([".mp3", ".wav", ".m4a", ".aac", ".aiff"].includes(extension)) {
    return "audio";
  }

  if ([".mp4", ".mov", ".webm", ".mpeg"].includes(extension)) {
    return "video";
  }

  if ([".pdf", ".ppt", ".pptx"].includes(extension)) {
    return "deck";
  }

  if ([".jpg", ".jpeg", ".png", ".gif"].includes(extension)) {
    return "image";
  }

  if ([".yaml", ".yml", ".json", ".csv", ".tsv"].includes(extension)) {
    return "structured";
  }

  if ([".txt", ".md", ".srt"].includes(extension)) {
    return "text";
  }

  return "unknown";
}

function looksLikeFileInput(value: string): boolean {
  if (value.trim() === "" || value.includes("\n")) {
    return false;
  }

  return path.extname(value) !== "";
}

function addInput(inputs: Record<string, string>, key: string, absolutePath: string, projectRoot: string): void {
  const uniqueKey = uniqueInputKey(inputs, key, absolutePath);
  inputs[uniqueKey] = projectRelativePath(projectRoot, absolutePath);
}

function uniqueInputKey(inputs: Record<string, string>, key: string, absolutePath: string): string {
  if (!Object.prototype.hasOwnProperty.call(inputs, key)) {
    return key;
  }

  const basename = path.basename(absolutePath, path.extname(absolutePath)).replace(/[^a-z0-9_]+/giu, "_");
  const fallback = `${key}_${basename}`.replace(/^_+|_+$/gu, "");
  if (fallback && !Object.prototype.hasOwnProperty.call(inputs, fallback)) {
    return fallback;
  }

  let index = 2;
  while (Object.prototype.hasOwnProperty.call(inputs, `${key}_${index}`)) {
    index += 1;
  }

  return `${key}_${index}`;
}

function globToRegExpSource(pattern: string): string {
  let source = "";
  let index = 0;

  while (index < pattern.length) {
    if (pattern.startsWith("**/", index)) {
      source += "(?:.*/)?";
      index += 3;
      continue;
    }

    if (pattern.startsWith("**", index)) {
      source += ".*";
      index += 2;
      continue;
    }

    const char = pattern[index];
    if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += escapeRegExp(char);
    }

    index += 1;
  }

  return source;
}

function escapeRegExp(value: string): string {
  return value.replace(/[\\^$.*+?()[\]{}|]/gu, "\\$&");
}

function toPosixPath(value: string): string {
  return value.replace(/\\/gu, "/");
}

function isRelativeChild(relativePath: string): boolean {
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}

function byName(left: { name: string }, right: { name: string }): number {
  return left.name.localeCompare(right.name);
}
