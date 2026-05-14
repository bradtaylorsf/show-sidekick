import { listCheckpoints, readCheckpoint } from "../checkpoints/index.js";
import type { PipelineManifest, Stage } from "../pipelines/index.js";
import type { Registry } from "../registry/index.js";
import type { ToolExecutionPolicy } from "../registry/tool.js";
import type { LoadedEpisode, LoadedShow } from "../shows/index.js";

export type StageRunOptions = {
  sample: boolean;
  budget_usd?: number;
  dryRun?: boolean;
  from?: string;
  to?: string;
  only?: string;
  cost_drift_threshold?: number;
  nonInteractive?: boolean;
};

export type StageContext = {
  show: LoadedShow;
  episode: LoadedEpisode;
  pipeline: PipelineManifest;
  stage: Stage;
  playbook: unknown;
  priorArtifacts: Record<string, unknown>;
  registry: Registry;
  cuesheet?: unknown;
  runOptions: StageRunOptions;
  toolPolicy?: ToolExecutionPolicy;
  revision_notes: string[];
  skills_read: string[];
  markSkillRead(name: string): void;
};

export type CreateStageContextOptions = {
  show: LoadedShow;
  episode: LoadedEpisode;
  pipeline: PipelineManifest;
  stage: Stage;
  playbook: unknown;
  priorArtifacts?: Record<string, unknown>;
  registry: Registry;
  cuesheet?: unknown;
  runOptions?: Partial<StageRunOptions>;
  toolPolicy?: ToolExecutionPolicy;
  revisionNotes?: string[];
  skillsRead?: string[];
};

type SlugRef = string | { slug: string };

export function createStageContext(options: CreateStageContextOptions): StageContext {
  const skillsRead = [...(options.skillsRead ?? [])];
  const skillSet = new Set(skillsRead);

  return {
    show: options.show,
    episode: options.episode,
    pipeline: options.pipeline,
    stage: options.stage,
    playbook: options.playbook,
    priorArtifacts: options.priorArtifacts ?? {},
    registry: options.registry,
    cuesheet: options.cuesheet,
    runOptions: {
      sample: false,
      ...options.runOptions,
    },
    toolPolicy: options.toolPolicy,
    revision_notes: [...(options.revisionNotes ?? [])],
    skills_read: skillsRead,
    markSkillRead(name: string): void {
      if (skillSet.has(name)) {
        return;
      }

      skillSet.add(name);
      skillsRead.push(name);
    },
  };
}

export async function loadPriorArtifacts(
  projectRoot: string,
  show: SlugRef,
  episode: SlugRef,
  pipeline: PipelineManifest,
): Promise<Record<string, unknown>> {
  const showSlug = slugOf(show);
  const episodeSlug = slugOf(episode);
  const pipelineStageSlugs = new Set(pipeline.stages.map((stage) => stage.slug));
  const artifacts: Record<string, unknown> = {};

  for (const stageSlug of await listCheckpoints(projectRoot, showSlug, episodeSlug)) {
    if (!pipelineStageSlugs.has(stageSlug)) {
      continue;
    }

    const checkpoint = await readCheckpoint(projectRoot, showSlug, episodeSlug, stageSlug);
    if (checkpoint.status === "completed" || checkpoint.status === "awaiting_human") {
      artifacts[stageSlug] = checkpoint.artifact;
    }
  }

  return artifacts;
}

function slugOf(value: SlugRef): string {
  return typeof value === "string" ? value : value.slug;
}
