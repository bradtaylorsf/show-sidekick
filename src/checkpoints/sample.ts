import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { ConfigIssue } from "../config/errors.js";
import { CheckpointMissingError, InvalidCheckpoint } from "./errors.js";
import { atomicWrite } from "./io.js";
import { sampleCheckpointFile } from "./paths.js";
import { readState, updateState, type PipelineState } from "./state.js";

type ErrorWithCode = Error & { code?: string };

export const SampleCheckpointPayloadSchema = z.object({
  cost_for_this_sample: z.number().nonnegative(),
  cumulative_sample_cost: z.number().nonnegative(),
  projected_full_cost: z.number().nonnegative(),
  sample_video_path: z.string(),
  revision_note: z.string().optional(),
});

export const SampleCheckpointSchema = SampleCheckpointPayloadSchema.extend({
  version: z.number().int().positive(),
  status: z.literal("awaiting_human"),
  timestamp: z.string(),
});

export type SampleCheckpointPayload = z.infer<typeof SampleCheckpointPayloadSchema>;
export type SampleCheckpoint = z.infer<typeof SampleCheckpointSchema>;

export async function writeSampleCheckpoint(
  projectRoot: string,
  show: string,
  episode: string,
  version: number,
  payload: SampleCheckpointPayload,
): Promise<SampleCheckpoint> {
  const filePath = sampleCheckpointFile(projectRoot, show, episode, version);
  const payloadResult = SampleCheckpointPayloadSchema.safeParse(payload);

  if (!payloadResult.success) {
    throw new InvalidCheckpoint(filePath, payloadResult.error.issues.map(toConfigIssue));
  }

  const checkpoint = SampleCheckpointSchema.parse({
    ...payloadResult.data,
    version,
    status: "awaiting_human",
    timestamp: new Date().toISOString(),
  });

  await atomicWrite(filePath, `${JSON.stringify(checkpoint, null, 2)}\n`);

  const state = await readState(projectRoot, show, episode);
  await updateState(projectRoot, show, episode, {
    sample: {
      ...(state?.sample ?? {}),
      latest_version: version,
    },
  });

  return checkpoint;
}

export async function readSampleCheckpoint(
  projectRoot: string,
  show: string,
  episode: string,
  version: number,
): Promise<SampleCheckpoint> {
  const filePath = sampleCheckpointFile(projectRoot, show, episode, version);
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

  const result = SampleCheckpointSchema.safeParse(parsed);
  if (!result.success) {
    throw new InvalidCheckpoint(filePath, result.error.issues.map(toConfigIssue));
  }

  return result.data;
}

export function latestSampleVersion(state: PipelineState | undefined): number {
  return state?.sample?.latest_version ?? 0;
}

function toConfigIssue(issue: z.ZodIssue): ConfigIssue {
  return {
    path: issue.path.join("."),
    message: issue.message,
  };
}
