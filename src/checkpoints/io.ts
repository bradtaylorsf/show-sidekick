import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ZodIssue } from "zod";
import { CheckpointSchema, type Checkpoint } from "./checkpoint.js";
import { CheckpointMissingError, InvalidCheckpoint } from "./errors.js";
import { checkpointDir, checkpointFile } from "./paths.js";

type ErrorWithCode = Error & { code?: string };

export async function writeCheckpoint(
  projectRoot: string,
  show: string,
  episode: string,
  stage: string,
  checkpoint: Checkpoint,
): Promise<void> {
  const filePath = checkpointFile(projectRoot, show, episode, stage);
  const result = CheckpointSchema.safeParse(checkpoint);

  if (!result.success) {
    throw new InvalidCheckpoint(filePath, result.error.issues.map(toConfigIssue));
  }

  await atomicWrite(filePath, `${JSON.stringify(result.data, null, 2)}\n`);
}

export async function readCheckpoint(
  projectRoot: string,
  show: string,
  episode: string,
  stage: string,
): Promise<Checkpoint> {
  const filePath = checkpointFile(projectRoot, show, episode, stage);
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const fileError = error as ErrorWithCode;

    if (fileError.code === "ENOENT") {
      throw new CheckpointMissingError(filePath);
    }

    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new InvalidCheckpoint(filePath, [{ path: "", message: (error as Error).message }]);
  }

  const result = CheckpointSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidCheckpoint(filePath, result.error.issues.map(toConfigIssue));
  }

  return result.data;
}

export async function listCheckpoints(projectRoot: string, show: string, episode: string): Promise<string[]> {
  const dir = checkpointDir(projectRoot, show, episode);

  try {
    const entries = await readdir(dir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
      .map((entry) => path.basename(entry.name, ".json"))
      .sort((left, right) => left.localeCompare(right));
  } catch (error) {
    const fileError = error as ErrorWithCode;

    if (fileError.code === "ENOENT") {
      return [];
    }

    throw error;
  }
}

export async function atomicWrite(filePath: string, contents: string): Promise<void> {
  const dir = path.dirname(filePath);
  const tempPath = path.join(dir, `.${path.basename(filePath)}.tmp-${process.pid}-${randomUUID()}`);

  await mkdir(dir, { recursive: true });
  await writeFile(tempPath, contents, "utf8");

  try {
    await rename(tempPath, filePath);
  } catch (error) {
    await unlink(tempPath).catch(() => undefined);
    throw error;
  }
}

function toConfigIssue(issue: ZodIssue): { path: string; message: string } {
  return {
    path: issue.path.join("."),
    message: issue.message,
  };
}
