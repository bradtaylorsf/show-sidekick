import { readFile } from "node:fs/promises";
import { z } from "zod";
import { CostEntrySchema, CostLogSchema, type CostEntry, type CostLog } from "../artifacts/cost-log.js";
import { ConfigError, type ConfigIssue } from "../config/errors.js";
import { atomicWrite } from "../checkpoints/io.js";
import { costLogFile } from "./paths.js";

type ErrorWithCode = Error & { code?: string };

const appendQueues = new Map<string, Promise<unknown>>();

export async function recordCost(
  projectRoot: string,
  show: string,
  episode: string,
  entry: CostEntry,
): Promise<CostLog> {
  const filePath = costLogFile(projectRoot, show, episode);
  const parsedEntry = CostEntrySchema.parse(entry);

  return enqueueAppend(filePath, async () => {
    const current = await readCostLogFile(filePath);
    const next = [...current, parsedEntry];
    await atomicWrite(filePath, `${JSON.stringify(next, null, 2)}\n`);
    return next;
  });
}

export async function readCostLog(projectRoot: string, show: string, episode: string): Promise<CostLog> {
  return readCostLogFile(costLogFile(projectRoot, show, episode));
}

async function readCostLogFile(filePath: string): Promise<CostLog> {
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const fileError = error as ErrorWithCode;

    if (fileError.code === "ENOENT") {
      return [];
    }

    throw error;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch (error) {
    throw new ConfigError({
      filePath,
      issues: [{ path: "", message: (error as Error).message }],
    });
  }

  const result = CostLogSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError({
      filePath,
      issues: result.error.issues.map(toConfigIssue),
    });
  }

  return result.data;
}

function enqueueAppend<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = appendQueues.get(filePath) ?? Promise.resolve();
  const next = previous.then(operation, operation);
  const tracked = next.catch(() => undefined).finally(() => {
    if (appendQueues.get(filePath) === tracked) {
      appendQueues.delete(filePath);
    }
  });
  appendQueues.set(filePath, tracked);
  return next;
}

function toConfigIssue(issue: z.ZodIssue): ConfigIssue {
  return {
    path: issue.path.join("."),
    message: issue.message,
  };
}
