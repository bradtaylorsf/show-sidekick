import { existsSync, statSync } from "node:fs";
import { rename } from "node:fs/promises";
import path from "node:path";
import { BRANDING, LEGACY_BRANDING } from "../branding.js";
import { InvalidResourceNameError, InvalidShowEpisodeError, ProjectRootNotFoundError } from "./errors.js";

export type ResourceKind =
  | "shows"
  | "pipelines"
  | "playbooks"
  | "skills"
  | "projects"
  | "music_library";

export type ProjectPaths = {
  shows: string;
  pipelines: string;
  playbooks: string;
  skills: string;
  cache: string;
  projects: string;
  musicLibrary: string;
};

export type ParsedShowEpisode = {
  show: string;
  episode: string;
  showDir: string;
  episodeFile: string;
};

export function findProjectRoot(cwd: string = process.cwd()): string {
  let current = path.resolve(cwd);

  while (true) {
    if (isProjectRoot(current)) {
      return current;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      throw new ProjectRootNotFoundError(path.resolve(cwd));
    }
    current = parent;
  }
}

export function projectPaths(root: string): ProjectPaths {
  const absoluteRoot = path.resolve(root);

  return {
    shows: path.join(absoluteRoot, "shows"),
    pipelines: path.join(absoluteRoot, "pipelines"),
    playbooks: path.join(absoluteRoot, "playbooks"),
    skills: path.join(absoluteRoot, "skills"),
    cache: preferredCacheDir(absoluteRoot),
    projects: path.join(absoluteRoot, "projects"),
    musicLibrary: path.join(absoluteRoot, "music_library"),
  };
}

export function resolve(kind: ResourceKind, name: string, root: string = findProjectRoot()): string {
  const absoluteRoot = path.resolve(root);
  const localParent = path.join(absoluteRoot, resourceDirectory(kind));
  const cacheParent = path.join(preferredCacheDir(absoluteRoot), resourceDirectory(kind));
  const localBase = path.join(localParent, name);
  const cacheBase = path.join(cacheParent, name);

  if (!isInside(localBase, localParent) || !isInside(cacheBase, cacheParent)) {
    throw new InvalidResourceNameError(name);
  }

  // User-owned resources override the bundled cache.
  for (const candidate of [...pathVariants(localBase), ...pathVariants(cacheBase)]) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return localBase;
}

export function parseShowEpisode(spec: string, root: string = findProjectRoot()): ParsedShowEpisode {
  const parts = spec.split("/");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new InvalidShowEpisodeError(spec);
  }

  const [show, episode] = parts as [string, string];
  if (!isSafeSegment(show) || !isSafeSegment(episode)) {
    throw new InvalidShowEpisodeError(spec);
  }

  const absoluteRoot = path.resolve(root);
  const showsRoot = path.join(absoluteRoot, "shows");
  const showDir = path.join(showsRoot, show);

  return {
    show,
    episode,
    showDir,
    episodeFile: path.join(showDir, "episodes", `${episode}.yaml`),
  };
}

function isProjectRoot(candidate: string): boolean {
  const claudePath = path.join(candidate, "CLAUDE.md");
  const agentsPath = path.join(candidate, "AGENTS.md");
  const envExamplePath = path.join(candidate, ".env.example");
  const publicCachePath = publicCacheDir(candidate);
  const legacyCachePath = legacyCacheDir(candidate);

  return (
    (existsSync(agentsPath) && (isDirectory(publicCachePath) || existsSync(envExamplePath))) ||
    (existsSync(agentsPath) && isDirectory(legacyCachePath)) ||
    (existsSync(claudePath) && (isDirectory(publicCachePath) || isDirectory(legacyCachePath)))
  );
}

function isDirectory(candidate: string): boolean {
  try {
    return statSync(candidate).isDirectory();
  } catch {
    return false;
  }
}

function resourceDirectory(kind: ResourceKind): string {
  return kind;
}

export function publicCacheDir(root: string): string {
  return path.join(path.resolve(root), BRANDING.cacheDir);
}

export function legacyCacheDir(root: string): string {
  return path.join(path.resolve(root), LEGACY_BRANDING.cacheDir);
}

export function preferredCacheDir(root: string): string {
  const publicCachePath = publicCacheDir(root);
  const legacyCachePath = legacyCacheDir(root);

  if (isDirectory(publicCachePath) || !isDirectory(legacyCachePath)) {
    return publicCachePath;
  }

  return legacyCachePath;
}

export type LegacyCacheMigrationResult = "none" | "migrated" | "legacy-ignored";

export async function migrateLegacyProjectCache(root: string): Promise<LegacyCacheMigrationResult> {
  const publicCachePath = publicCacheDir(root);
  const legacyCachePath = legacyCacheDir(root);

  if (!isDirectory(legacyCachePath)) {
    return "none";
  }

  if (isDirectory(publicCachePath)) {
    return "legacy-ignored";
  }

  await rename(legacyCachePath, publicCachePath);
  return "migrated";
}

function pathVariants(base: string): string[] {
  if (path.extname(base)) {
    return [base];
  }

  return [base, `${base}.yaml`, `${base}.md`];
}

function isInside(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative !== "" && !relative.startsWith("..") && !path.isAbsolute(relative);
}

export function isSafeSegment(segment: string): boolean {
  return (
    segment !== "" &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes("/") &&
    !segment.includes("\\") &&
    !segment.includes("\0")
  );
}
