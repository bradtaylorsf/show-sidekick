import { z } from "zod";
import { ProviderProfileNameSchema } from "../providers/profiles.js";
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
  provider_profile: ProviderProfileNameSchema.optional(),
  inputs: z.record(z.string(), z.unknown()).default({}),
  cast: z.array(z.string()).default([]),
  tags: z.array(z.string()).optional(),
});

export type Episode = z.infer<typeof EpisodeSchema>;

export type EpisodeValidationError = {
  path: string;
  message: string;
};

export type EpisodeValidationResult =
  | {
      ok: true;
      errors: [];
    }
  | {
      ok: false;
      errors: EpisodeValidationError[];
    };

export function validateEpisodeAgainstShow(episode: Episode, show: Show): EpisodeValidationResult {
  const pipeline = episode.pipeline ?? show.defaults.pipeline;

  if (!(pipeline in show.pipelines)) {
    return {
      ok: false,
      errors: [
        {
          path: "pipeline",
          message: `episode.pipeline '${pipeline}' is not a key in show.pipelines`,
        },
      ],
    };
  }

  return { ok: true, errors: [] };
}

export function assertEpisodeAgainstShow(episode: Episode, show: Show): void {
  const result = validateEpisodeAgainstShow(episode, show);

  if (!result.ok) {
    throw new Error(result.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
  }
}
