import { access } from "node:fs/promises";
import path from "node:path";
import { BRANDING } from "../branding.js";
import { loadYaml } from "../config/loader.js";
import { projectPaths } from "../paths/project.js";
import { EpisodeSchema, type Episode } from "./episode.js";
import { ShowSchema, type Show } from "./show.js";

export type LoadedShow = Show & {
  projectRoot: string;
  rootDir: string;
  brandPath?: string;
  charactersDir?: string;
  skillsDir?: string;
};

export type LoadedEpisode = Episode & {
  filePath: string;
};

export async function loadShow(projectRoot: string, slug: string): Promise<LoadedShow> {
  const absoluteProjectRoot = path.resolve(projectRoot);
  const showsRoot = projectPaths(absoluteProjectRoot).shows;
  const rootDir = path.join(showsRoot, slug);
  ensureInside(rootDir, showsRoot, slug);

  const show = (await loadYaml(path.join(rootDir, "show.yaml"), ShowSchema)) as Show;

  const brandPath = show.brand ? path.resolve(rootDir, show.brand) : undefined;
  const charactersDir = show.characters ? path.resolve(rootDir, show.characters) : undefined;
  const skillsDir = show.skills ? path.resolve(rootDir, show.skills) : undefined;

  return {
    ...show,
    brand: brandPath,
    characters: charactersDir,
    skills: skillsDir,
    projectRoot: absoluteProjectRoot,
    rootDir,
    brandPath,
    charactersDir,
    skillsDir,
  };
}

export async function loadEpisode(show: LoadedShow, slug: string): Promise<LoadedEpisode> {
  const filePath = episodeFilePath(show, slug);

  if (!(await exists(filePath))) {
    throw new Error(
      `no episode '${slug}' in show '${show.slug}': ${filePath} not found. Create it with \`${BRANDING.primaryCli} new episode ${show.slug} ${slug} --from <track-or-folder>\` or \`${BRANDING.primaryCli} import <path> --as ${show.slug}/${slug}\``,
    );
  }

  const episode = (await loadYaml(filePath, EpisodeSchema)) as Episode;

  return {
    ...episode,
    filePath,
    inputs: await resolveEpisodeInputs(show.projectRoot, path.dirname(filePath), episode.inputs),
  };
}

export function episodeFilePath(show: LoadedShow, slug: string): string {
  const episodesRoot = path.join(show.rootDir, "episodes");
  const filePath = path.join(episodesRoot, `${slug}.yaml`);
  ensureInside(filePath, episodesRoot, slug);
  return filePath;
}

/**
 * Relative `inputs.*` paths resolve against the episode YAML's own folder first,
 * then against the project root (the original base, which existing episodes and
 * `showkick import` use).
 */
async function resolveEpisodeInputs(
  projectRoot: string,
  episodeDir: string,
  inputs: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const resolved: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(inputs)) {
    if (key === "reference") {
      resolved[key] = value;
      continue;
    }

    if (typeof value === "string" && looksLikeFilePath(value)) {
      resolved[key] = await resolveInputPath(key, value, projectRoot, episodeDir);
      continue;
    }

    resolved[key] = value;
  }

  return resolved;
}

async function resolveInputPath(key: string, value: string, projectRoot: string, episodeDir: string): Promise<string> {
  if (path.isAbsolute(value) || looksLikeWindowsAbsolutePath(value)) {
    const absolutePath = path.resolve(value);
    if (!(await exists(absolutePath))) {
      throw new Error(`inputs.${key}: file not found at ${absolutePath}`);
    }
    return absolutePath;
  }

  const candidates = [
    { base: "the episode file's folder", dir: episodeDir, path: path.resolve(episodeDir, value) },
    { base: "the project root", dir: projectRoot, path: path.resolve(projectRoot, value) },
  ];

  for (const candidate of candidates) {
    if (await exists(candidate.path)) {
      return candidate.path;
    }
  }

  const tried = candidates.map((candidate) => `${candidate.path} (relative to ${candidate.base}, ${candidate.dir})`).join(" or ");
  throw new Error(`inputs.${key}: file not found for '${value}'; tried ${tried}`);
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function looksLikeFilePath(value: string): boolean {
  if (value.trim() === "" || value.includes("\n")) {
    return false;
  }

  if (looksLikeUrl(value)) {
    return false;
  }

  return (
    path.isAbsolute(value) ||
    value.startsWith("./") ||
    value.startsWith("../") ||
    looksLikeWindowsAbsolutePath(value) ||
    looksLikeProjectRelativePath(value) ||
    hasKnownFileExtension(value)
  );
}

function looksLikeUrl(value: string): boolean {
  if (/^[a-z][a-z0-9+.-]*:\/\//iu.test(value)) {
    return true;
  }

  if (hasKnownFileExtension(value) && !value.includes("/") && !value.includes("\\")) {
    return false;
  }

  const [firstSegment] = value.split(/[/?#]/u, 1);
  return /^[a-z0-9.-]+\.[a-z]{2,}$/iu.test(firstSegment ?? "");
}

function looksLikeWindowsAbsolutePath(value: string): boolean {
  return /^[a-z]:[\\/]/iu.test(value);
}

function looksLikeProjectRelativePath(value: string): boolean {
  return value.includes("/") || value.includes("\\");
}

function hasKnownFileExtension(value: string): boolean {
  const extension = path.extname(value).toLowerCase();
  return FILE_INPUT_EXTENSIONS.has(extension);
}

const FILE_INPUT_EXTENSIONS = new Set([
  ".aac",
  ".aiff",
  ".csv",
  ".gif",
  ".jpeg",
  ".jpg",
  ".json",
  ".m4a",
  ".md",
  ".mov",
  ".mp3",
  ".mp4",
  ".mpeg",
  ".pdf",
  ".png",
  ".srt",
  ".tsv",
  ".txt",
  ".wav",
  ".webm",
  ".yaml",
  ".yml",
]);

function ensureInside(candidate: string, parent: string, name: string): void {
  const relative = path.relative(parent, candidate);

  if (relative === "" || relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`invalid path segment '${name}'`);
  }
}
