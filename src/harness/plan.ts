import type { PipelineManifest, Stage } from "../pipelines/index.js";
import type { StageRunOptions } from "./context.js";

export type PlanStagesOptions = {
  completedStages?: ReadonlySet<string> | readonly string[];
};

export function planStages(
  pipeline: PipelineManifest,
  runOptions: Pick<StageRunOptions, "from" | "to" | "only">,
  options: PlanStagesOptions = {},
): Stage[] {
  const planned = sliceStages(pipeline.stages, runOptions);
  enforceAudioSyncInvariant(pipeline, planned, toStageSet(options.completedStages));
  return planned;
}

function sliceStages(stages: Stage[], runOptions: Pick<StageRunOptions, "from" | "to" | "only">): Stage[] {
  if (runOptions.only !== undefined) {
    return stages.filter((stage) => stage.slug === runOptions.only);
  }

  const fromIndex = runOptions.from === undefined ? 0 : stages.findIndex((stage) => stage.slug === runOptions.from);
  const toIndex = runOptions.to === undefined ? stages.length - 1 : stages.findIndex((stage) => stage.slug === runOptions.to);

  if (fromIndex === -1 || toIndex === -1 || fromIndex > toIndex) {
    return [];
  }

  return stages.slice(fromIndex, toIndex + 1);
}

function enforceAudioSyncInvariant(
  pipeline: PipelineManifest,
  plannedStages: Stage[],
  completedStages: ReadonlySet<string>,
): void {
  const requiredStages = plannedStages.filter((stage) => stage.audio_sync === "required");

  if (requiredStages.length === 0) {
    return;
  }

  const buildStage = pipeline.stages.find((stage) => stage.audio_sync === "build");
  if (buildStage === undefined) {
    throw new Error(
      `audio_sync: required stage '${requiredStages[0]?.slug}' cannot run because the pipeline has no audio_sync: build stage`,
    );
  }

  if (completedStages.has(buildStage.slug)) {
    return;
  }

  const buildPlanIndex = plannedStages.findIndex((stage) => stage.slug === buildStage.slug);

  for (const requiredStage of requiredStages) {
    const requiredPlanIndex = plannedStages.findIndex((stage) => stage.slug === requiredStage.slug);
    if (buildPlanIndex === -1 || buildPlanIndex > requiredPlanIndex) {
      throw new Error(
        `audio_sync: required stage '${requiredStage.slug}' cannot run before audio_sync: build stage '${buildStage.slug}' has completed`,
      );
    }
  }
}

function toStageSet(value: PlanStagesOptions["completedStages"]): ReadonlySet<string> {
  if (value instanceof Set) {
    return value;
  }

  return new Set(value ?? []);
}
