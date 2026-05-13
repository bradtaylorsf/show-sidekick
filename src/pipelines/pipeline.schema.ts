import { z } from "zod";

import { RuntimeEnum } from "../shows/show.schema.js";

export const CANONICAL_STAGE_ORDER = [
  "research",
  "idea",
  "proposal",
  "script",
  "capture",
  "cuesheet",
  "character_design",
  "rig_plan",
  "scene_plan",
  "assets",
  "edit",
  "compose",
  "publish",
] as const;

const canonicalStageOrderLookup = new Map<string, number>(
  CANONICAL_STAGE_ORDER.map((stage, index) => [stage, index]),
);

export const MasterClockEnum = z.enum([
  "audio",
  "voiceover",
  "action_timeline",
  "none",
]);

export const PipelineStatusEnum = z.enum([
  "production",
  "beta",
  "experimental",
]);

export const HumanApprovalEnum = z.enum(["required", "optional", "never"]);

export const AudioSyncEnum = z.enum(["build", "required", "none"]);

export const EstimatedCostBucketSchema = z
  .object({
    usd: z.number().nonnegative(),
    comment: z.string().min(1).optional(),
  })
  .passthrough();

export const EstimatedCostSchema = z
  .object({
    sample: EstimatedCostBucketSchema.optional(),
    full: EstimatedCostBucketSchema.optional(),
  })
  .passthrough();

export const StageSchema = z
  .object({
    slug: z.string().min(1),
    description: z.string().min(1).optional(),
    skill: z.string().min(1).optional(),
    produces: z.string().min(1).optional(),
    tools_available: z.array(z.string().min(1)).default([]),
    review_focus: z.array(z.string().min(1)).default([]),
    success_criteria: z.array(z.record(z.string(), z.unknown())).default([]),
    human_approval: HumanApprovalEnum.optional(),
    audio_sync: AudioSyncEnum.optional(),
    sample_mode_supported: z.boolean().optional(),
    estimated_cost: EstimatedCostSchema.optional(),
    requires_runtime: RuntimeEnum.or(z.literal("any")).optional(),
  })
  .passthrough();

export const DefaultsSchema = z.object({}).passthrough();

export const ExportSchema = z
  .object({
    supported_targets: z.array(z.string().min(1)).optional(),
    default_target: z.string().min(1).optional(),
    notes: z.string().min(1).optional(),
  })
  .passthrough();

export const MetadataSchema = z.record(z.string(), z.unknown());

export const OrchestrationSchema = z
  .object({
    budget_default_usd: z.number().nonnegative().default(3.0),
    max_revisions_per_stage: z.number().int().nonnegative().default(2),
    max_send_backs: z.number().int().nonnegative().default(3),
    max_wall_time_minutes: z.number().int().positive().default(30),
  })
  .passthrough();

export const SampleSchema = z
  .object({
    duration_s_min: z.number().nonnegative().optional(),
    duration_s_max: z.number().nonnegative().optional(),
    hint: z.string().min(1).optional(),
  })
  .passthrough();

export const PipelineManifestSchema = z
  .object({
    slug: z.string().min(1),
    display_name: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    status: PipelineStatusEnum.optional(),
    master_clock: MasterClockEnum.optional(),
    defaults: DefaultsSchema.optional(),
    stages: z.array(StageSchema).min(1),
    export: ExportSchema.optional(),
    metadata: MetadataSchema.optional(),
    orchestration: OrchestrationSchema.default({}),
    sample: SampleSchema.optional(),
  })
  .passthrough()
  .superRefine((manifest, context) => {
    const firstStageIndexBySlug = new Map<string, number>();
    const audioBuildStageIndexes: number[] = [];
    let previousCanonicalStage: { slug: string; order: number } | undefined;

    manifest.stages.forEach((stage, index) => {
      const firstStageIndex = firstStageIndexBySlug.get(stage.slug);
      if (firstStageIndex !== undefined) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stages", index, "slug"],
          message: `stage slug '${stage.slug}' is declared more than once`,
        });
      } else {
        firstStageIndexBySlug.set(stage.slug, index);
      }

      if (stage.audio_sync === "build") {
        audioBuildStageIndexes.push(index);
      }

      if (stage.requires_runtime !== undefined && stage.slug !== "compose") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stages", index, "requires_runtime"],
          message: "requires_runtime is valid only on the compose stage",
        });
      }

      const canonicalOrder = canonicalStageOrderLookup.get(stage.slug);
      if (canonicalOrder === undefined) {
        return;
      }

      if (
        previousCanonicalStage !== undefined &&
        canonicalOrder < previousCanonicalStage.order
      ) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stages", index, "slug"],
          message: `canonical stage '${stage.slug}' appears after '${previousCanonicalStage.slug}', but canonical stages must follow: ${CANONICAL_STAGE_ORDER.join(" -> ")}`,
        });
        return;
      }

      previousCanonicalStage = {
        slug: stage.slug,
        order: canonicalOrder,
      };
    });

    if (audioBuildStageIndexes.length > 1) {
      audioBuildStageIndexes.slice(1).forEach((stageIndex) => {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stages", stageIndex, "audio_sync"],
          message: "at most one stage may declare audio_sync: build",
        });
      });
    }

    const firstAudioBuildStageIndex = audioBuildStageIndexes[0];
    if (firstAudioBuildStageIndex === undefined) {
      return;
    }

    manifest.stages.forEach((stage, index) => {
      if (index < firstAudioBuildStageIndex && stage.audio_sync === "required") {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["stages", index, "audio_sync"],
          message: "audio_sync: required may not precede audio_sync: build",
        });
      }
    });
  });

export type MasterClock = z.infer<typeof MasterClockEnum>;
export type PipelineStatus = z.infer<typeof PipelineStatusEnum>;
export type HumanApproval = z.infer<typeof HumanApprovalEnum>;
export type AudioSync = z.infer<typeof AudioSyncEnum>;
export type EstimatedCostBucket = z.infer<typeof EstimatedCostBucketSchema>;
export type EstimatedCost = z.infer<typeof EstimatedCostSchema>;
export type Stage = z.infer<typeof StageSchema>;
export type PipelineDefaults = z.infer<typeof DefaultsSchema>;
export type PipelineExport = z.infer<typeof ExportSchema>;
export type PipelineMetadata = z.infer<typeof MetadataSchema>;
export type PipelineOrchestration = z.infer<typeof OrchestrationSchema>;
export type PipelineSample = z.infer<typeof SampleSchema>;
export type PipelineManifest = z.infer<typeof PipelineManifestSchema>;
