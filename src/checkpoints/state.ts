import { readFile } from "node:fs/promises";
import { z } from "zod";
import { ConfigError, type ConfigIssue } from "../config/errors.js";
import { CheckpointStatusSchema } from "./checkpoint.js";
import { atomicWrite } from "./io.js";
import { stateFile } from "./paths.js";

type ErrorWithCode = Error & { code?: string };

export const StateSchema = z
  .object({
    show: z.string(),
    episode: z.string(),
    pipeline: z.string().optional(),
    current_stage: z.string().optional(),
    last_status: CheckpointStatusSchema.optional(),
    last_checkpoint_at: z.string().optional(),
    cost_total_usd: z.number().nonnegative().optional(),
    revision_notes: z.record(z.string(), z.array(z.string())).optional(),
    queued_stage_revision: z
      .object({
        stage: z.string(),
        note: z.string(),
        queued_at: z.string(),
      })
      .optional(),
    failed: z
      .object({
        stage: z.string(),
        error: z.string(),
        last_artifact_path: z.string().optional(),
        last_cost_entries: z.array(z.unknown()).default([]),
      })
      .optional(),
    sample: z
      .object({
        latest_version: z.number().int().nonnegative().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type PipelineState = z.infer<typeof StateSchema>;
export type PipelineStatePatch = Partial<PipelineState>;

export async function writeState(
  projectRoot: string,
  show: string,
  episode: string,
  state: PipelineState,
): Promise<void> {
  const filePath = stateFile(projectRoot, show, episode);
  const result = StateSchema.safeParse(state);

  if (!result.success) {
    throw new ConfigError({
      filePath,
      issues: result.error.issues.map(toConfigIssue),
    });
  }

  await atomicWrite(filePath, `${JSON.stringify(result.data, null, 2)}\n`);
}

export async function readState(
  projectRoot: string,
  show: string,
  episode: string,
): Promise<PipelineState | undefined> {
  const filePath = stateFile(projectRoot, show, episode);
  let raw: string;

  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const fileError = error as ErrorWithCode;

    if (fileError.code === "ENOENT") {
      return undefined;
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

  const result = StateSchema.safeParse(parsed);
  if (!result.success) {
    throw new ConfigError({
      filePath,
      issues: result.error.issues.map(toConfigIssue),
    });
  }

  return result.data;
}

export async function updateState(
  projectRoot: string,
  show: string,
  episode: string,
  patch: PipelineStatePatch,
): Promise<PipelineState> {
  const current = await readState(projectRoot, show, episode);
  const nextState = {
    show,
    episode,
    ...current,
    ...patch,
  } as PipelineState;

  await writeState(projectRoot, show, episode, nextState);
  return nextState;
}

function toConfigIssue(issue: z.ZodIssue): ConfigIssue {
  return {
    path: issue.path.join("."),
    message: issue.message,
  };
}
