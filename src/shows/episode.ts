import { z } from "zod";
import { PipelineRuntimeSchema } from "./pipeline-config.js";
import type { Show } from "./show.js";

export const EpisodeSchema = z.object({
  slug: z.string(),
  title: z.string(),
  created: z.coerce.date(),
  pipeline: z.string().optional(),
  playbook: z.string().optional(),
  runtime: PipelineRuntimeSchema.optional(),
  aspect: z.string().optional(),
  budget_usd: z.number().positive().optional(),
  inputs: z.record(z.string(), z.unknown()).default({}),
  cast: z.array(z.string()).default([]),
  tags: z.array(z.string()).optional(),
});

export type Episode = z.infer<typeof EpisodeSchema>;

export function validateEpisodeAgainstShow(episode: Episode, show: Show): void {
  const pipeline = episode.pipeline ?? show.defaults.pipeline;

  if (!(pipeline in show.pipelines)) {
    throw new Error(`episode.pipeline '${pipeline}' is not a key in show.pipelines`);
  }
}
