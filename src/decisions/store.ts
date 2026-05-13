import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { DecisionEntrySchema, DecisionLogSchema, type DecisionEntry, type DecisionLog } from "../artifacts/decision-log.js";
import { findProjectRoot, parseShowEpisode } from "../paths/project.js";

export type ShowEpisodeTarget = string | { show: string; episode: string };

export type DecisionStoreOptions = {
  root?: string;
};

export async function recordDecision(
  showEpisode: ShowEpisodeTarget,
  entry: unknown,
  options: DecisionStoreOptions = {},
): Promise<DecisionLog> {
  const validatedEntry = DecisionEntrySchema.parse(entry);
  const filePath = decisionsPath(showEpisode, options);
  const existing = await readDecisionLog(showEpisode, options);
  const nextLog = DecisionLogSchema.parse([...existing, validatedEntry]);

  await mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, `${JSON.stringify(nextLog, null, 2)}\n`, "utf8");
  await rename(tempPath, filePath);

  return nextLog;
}

export async function readDecisionLog(
  showEpisode: ShowEpisodeTarget,
  options: DecisionStoreOptions = {},
): Promise<DecisionLog> {
  const filePath = decisionsPath(showEpisode, options);

  try {
    const raw = await readFile(filePath, "utf8");
    return DecisionLogSchema.parse(JSON.parse(raw) as unknown);
  } catch (error) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export function currentDecisions(log: DecisionLog): DecisionEntry[] {
  const supersededIds = new Set(log.map((decision) => decision.supersedes).filter(isString));
  return log.filter((decision) => !supersededIds.has(decision.id));
}

export function decisionsPath(showEpisode: ShowEpisodeTarget, options: DecisionStoreOptions = {}): string {
  const root = path.resolve(options.root ?? findProjectRoot());
  const target = normalizeShowEpisode(showEpisode, root);

  return path.join(root, "projects", target.show, target.episode, "decisions.json");
}

function normalizeShowEpisode(showEpisode: ShowEpisodeTarget, root: string): { show: string; episode: string } {
  if (typeof showEpisode === "string") {
    const parsed = parseShowEpisode(showEpisode, root);
    return { show: parsed.show, episode: parsed.episode };
  }

  return showEpisode;
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
