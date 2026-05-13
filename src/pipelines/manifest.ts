import { z } from "zod";
import { canonicalIndex } from "./canonical-stages.js";
import { StageSchema } from "./stage.js";

export const PipelineStatusSchema = z.enum(["production", "beta", "experimental"]);
export const MasterClockSchema = z.enum(["audio", "voiceover", "action_timeline", "none"]);

const OrchestrationSchema = z
  .object({
    budget_default_usd: z.number().positive().default(3.0),
    max_revisions_per_stage: z.number().int().min(0).default(2),
    max_send_backs: z.number().int().min(0).default(3),
    max_wall_time_minutes: z.number().int().positive().default(30),
  })
  .default({});

export const PipelineManifestSchema = z
  .object({
    slug: z.string(),
    display_name: z.string().optional(),
    description: z.string().optional(),
    status: PipelineStatusSchema.optional(),
    master_clock: MasterClockSchema.optional(),
    defaults: z.record(z.string(), z.unknown()).optional(),
    stages: z.array(StageSchema).min(1),
    export: z
      .object({
        supported_targets: z.array(z.string()).optional(),
        default_target: z.string().optional(),
        notes: z.string().optional(),
      })
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    orchestration: OrchestrationSchema,
    sample: z
      .object({
        duration_s_min: z.number().positive(),
        duration_s_max: z.number().positive(),
        hint: z.string().optional(),
      })
      .optional(),
  })
  .superRefine((manifest, ctx) => {
    const seen = new Map<string, number>();
    let buildStageIndex = -1;
    let previousCanonicalIndex = -1;
    let previousCanonicalSlug = "";

    manifest.stages.forEach((stage, index) => {
      const priorIndex = seen.get(stage.slug);
      if (priorIndex !== undefined) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stages", index, "slug"],
          message: `stage slug '${stage.slug}' is duplicated; first declared at stages[${priorIndex}]`,
        });
      } else {
        seen.set(stage.slug, index);
      }

      if (stage.audio_sync === "build") {
        if (buildStageIndex !== -1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["stages", index, "audio_sync"],
            message: `only one stage may declare audio_sync: build; first declared at stages[${buildStageIndex}]`,
          });
        } else {
          buildStageIndex = index;
        }
      }

      if (stage.requires_runtime !== undefined && stage.slug !== "compose") {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stages", index, "requires_runtime"],
          message: "requires_runtime is valid only on the compose stage",
        });
      }

      const currentCanonicalIndex = canonicalIndex(stage.slug);
      if (currentCanonicalIndex !== -1) {
        if (currentCanonicalIndex < previousCanonicalIndex) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["stages", index, "slug"],
            message: `canonical stage '${stage.slug}' must not appear after '${previousCanonicalSlug}'`,
          });
        } else {
          previousCanonicalIndex = currentCanonicalIndex;
          previousCanonicalSlug = stage.slug;
        }
      }
    });

    if (buildStageIndex !== -1) {
      manifest.stages.forEach((stage, index) => {
        if (stage.audio_sync === "required" && index < buildStageIndex) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["stages", index, "audio_sync"],
            message: "audio_sync: required may not precede an audio_sync: build stage",
          });
        }
      });
    }
  });

export type PipelineStatus = z.infer<typeof PipelineStatusSchema>;
export type MasterClock = z.infer<typeof MasterClockSchema>;
export type PipelineManifest = z.infer<typeof PipelineManifestSchema>;
export type Pipeline = PipelineManifest;
