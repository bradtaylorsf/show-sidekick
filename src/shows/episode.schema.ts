import { z } from "zod";

import { RuntimeEnum, type Show } from "./show.schema.js";

export const EpisodeSchema = z.object({
  slug: z.string().min(1),
  title: z.string().min(1),
  created: z.string().min(1),
  pipeline: z.string().min(1).optional(),
  playbook: z.string().min(1).optional(),
  runtime: RuntimeEnum.optional(),
  aspect: z.string().min(1).optional(),
  budget_usd: z.number().nonnegative().optional(),
  inputs: z.record(z.string(), z.unknown()),
  cast: z.array(z.string()).default([]),
  tags: z.array(z.string()).default([]),
});

export type Episode = z.infer<typeof EpisodeSchema>;

export type EpisodeValidationResult =
  | { ok: true; resolvedPipeline: string }
  | { ok: false; error: string };

export function validateEpisodeAgainstShow(
  episode: Episode,
  show: Show,
): EpisodeValidationResult {
  const resolvedPipeline = episode.pipeline ?? show.defaults.pipeline;
  const availablePipelines = Object.keys(show.pipelines);

  if (!availablePipelines.includes(resolvedPipeline)) {
    return {
      ok: false,
      error: `episode pipeline '${resolvedPipeline}' is not declared in show.pipelines (available: ${availablePipelines.join(", ")})`,
    };
  }

  return { ok: true, resolvedPipeline };
}
