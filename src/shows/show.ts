import { z } from "zod";
import { PipelineConfigSchema } from "./pipeline-config.js";

const IngestWatchSchema = z.object({
  path: z.string(),
  match: z.string(),
  pipeline: z.string(),
  slug_from: z.string().optional(),
});

export const ShowSchema = z
  .object({
    slug: z.string(),
    display_name: z.string(),
    description: z.string().optional(),
    created: z.coerce.date(),
    brand: z.string().optional(),
    characters: z.string().optional(),
    skills: z.string().optional(),
    pipelines: z
      .record(z.string(), PipelineConfigSchema)
      .refine((pipelines) => Object.keys(pipelines).length >= 1, {
        message: "show.pipelines must declare at least one pipeline",
      }),
    defaults: z.object({
      pipeline: z.string(),
      language: z.string().optional(),
    }),
    ingest: z
      .object({
        episode_template: z.string().optional(),
        watch: z.array(IngestWatchSchema).default([]),
      })
      .optional(),
    export: z
      .object({
        default_target: z.string().optional(),
        asset_link_mode: z.string().optional(),
      })
      .optional(),
  })
  .superRefine((show, ctx) => {
    const pipelineKeys = new Set(Object.keys(show.pipelines));

    if (!pipelineKeys.has(show.defaults.pipeline)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaults", "pipeline"],
        message: `defaults.pipeline '${show.defaults.pipeline}' is not a key in pipelines`,
      });
    }

    show.ingest?.watch.forEach((watch, index) => {
      if (!pipelineKeys.has(watch.pipeline)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ingest", "watch", index, "pipeline"],
          message: `ingest.watch[${index}].pipeline '${watch.pipeline}' is not a key in pipelines`,
        });
      }
    });
  });

export type Show = z.infer<typeof ShowSchema>;
