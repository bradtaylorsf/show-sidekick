import path from "node:path";

export function projectDir(projectRoot: string, show: string, episode: string): string {
  return path.join(path.resolve(projectRoot), "projects", safeSegment(show, "show"), safeSegment(episode, "episode"));
}

export function checkpointDir(projectRoot: string, show: string, episode: string): string {
  return path.join(projectDir(projectRoot, show, episode), "checkpoints");
}

export function checkpointFile(projectRoot: string, show: string, episode: string, stage: string): string {
  return path.join(checkpointDir(projectRoot, show, episode), `${safeSegment(stage, "stage")}.json`);
}

export function stateFile(projectRoot: string, show: string, episode: string): string {
  return path.join(projectDir(projectRoot, show, episode), "state.json");
}

function safeSegment(segment: string, label: string): string {
  if (
    segment === "" ||
    segment === "." ||
    segment === ".." ||
    segment.includes("/") ||
    segment.includes("\\") ||
    segment.includes("\0")
  ) {
    throw new Error(`invalid ${label} path segment '${segment}'`);
  }

  return segment;
}
