import { existsSync, statSync } from "node:fs";
import path from "node:path";
import { InvalidShowEpisodeError, ProjectRootNotFoundError } from "./errors.js";

export type ResourceKind =
  | "shows"
  | "pipelines"
  | "playbooks"
  | "skills"
  | ".predit"
  | "projects"
  | "music_library";

export type ProjectPaths = {
  shows: string;
  pipelines: string;
  playbooks: string;
  skills: string;
  predit: string;
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
    predit: path.join(absoluteRoot, ".predit"),
    projects: path.join(absoluteRoot, "projects"),
    musicLibrary: path.join(absoluteRoot, "music_library"),
  };
}

export function resolve(kind: ResourceKind, name: string, root: string = findProjectRoot()): string {
  const absoluteRoot = path.resolve(root);
  const localBase = path.join(absoluteRoot, resourceDirectory(kind), name);
  const cacheBase = path.join(absoluteRoot, ".predit", resourceDirectory(kind), name);

  // User-owned resources override the bundled .predit cache.
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
  const showDir = path.join(path.resolve(root), "shows", show);

  return {
    show,
    episode,
    showDir,
    episodeFile: path.join(showDir, "episodes", `${episode}.yaml`),
  };
}

function isProjectRoot(candidate: string): boolean {
  const claudePath = path.join(candidate, "CLAUDE.md");
  const preditPath = path.join(candidate, ".predit");

  return existsSync(claudePath) && isDirectory(preditPath);
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

function pathVariants(base: string): string[] {
  if (path.extname(base)) {
    return [base];
  }

  return [base, `${base}.yaml`, `${base}.md`];
}
