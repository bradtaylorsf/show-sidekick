import { z } from "zod";

export const RuntimeEnum = z.enum(["ffmpeg", "remotion", "hyperframes"]);

export const PipelineConfigSchema = z.object({
  playbook: z.string().min(1).optional(),
  runtime: RuntimeEnum.optional(),
  aspect: z.string().min(1).optional(),
  budget_usd: z.number().nonnegative().optional(),
  playbook_overrides: z.string().min(1).optional(),
});

export const IngestWatchSchema = z.object({
  path: z.string().min(1),
  match: z.string().min(1),
  pipeline: z.string().min(1),
  slug_from: z.enum(["parent_dir", "filename", "prompt"]),
});

export const IngestSchema = z.object({
  episode_template: z.string().min(1),
  watch: z.array(IngestWatchSchema),
});

export const ExportSchema = z.object({
  default_target: z.string().min(1),
  asset_link_mode: z.enum(["copy", "symlink", "reference"]),
});

export const ShowSchema = z
  .object({
    slug: z.string().min(1),
    display_name: z.string().min(1),
    description: z.string().min(1),
    created: z.string().min(1),
    brand: z.string().min(1),
    characters: z.string().min(1),
    skills: z.string().min(1).optional(),
    pipelines: z
      .record(z.string(), PipelineConfigSchema)
      .refine((pipelines) => Object.keys(pipelines).length >= 1, {
        message: "show.pipelines must declare at least one pipeline",
      }),
    defaults: z.object({
      pipeline: z.string().min(1),
      language: z.string().min(1).optional(),
    }),
    ingest: IngestSchema.optional(),
    export: ExportSchema.optional(),
  })
  .superRefine((show, context) => {
    const pipelineNames = Object.keys(show.pipelines);
    const pipelineNameSet = new Set(pipelineNames);

    if (!pipelineNameSet.has(show.defaults.pipeline)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["defaults", "pipeline"],
        message: `defaults.pipeline '${show.defaults.pipeline}' is not a key in pipelines`,
      });
    }

    show.ingest?.watch.forEach((watch, index) => {
      if (!pipelineNameSet.has(watch.pipeline)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["ingest", "watch", index, "pipeline"],
          message: `ingest.watch[${index}].pipeline '${watch.pipeline}' is not a key in pipelines`,
        });
      }
    });
  });

export type Runtime = z.infer<typeof RuntimeEnum>;
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
export type Show = z.infer<typeof ShowSchema>;
