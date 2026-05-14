import type { StageRunOptions } from "../../harness/context.js";
import type { VideoAnalysisBrief } from "../../artifacts/video-analysis-brief.js";
import { loadPipeline } from "../../pipelines/load.js";
import type { Pipeline } from "../../pipelines/manifest.js";
import { findProjectRoot, parseShowEpisode } from "../../paths/project.js";
import { assertEpisodeAgainstShow, loadEpisode, loadShow, type LoadedEpisode, type LoadedShow } from "../../shows/index.js";
import type { GlobalOptions } from "./stub.js";

export type LoadedRunTargetInput = {
  projectRoot: string;
  target: string;
  showSlug: string;
  episodeSlug: string;
  show: LoadedShow;
  episode: LoadedEpisode;
};

export type PipelineSelectionHint = {
  videoAnalysisBrief?: VideoAnalysisBrief;
};

export type LoadedRunTarget = LoadedRunTargetInput & {
  pipelineName: string;
  pipeline: Pipeline;
};

export type StageFlagOptions = GlobalOptions & {
  sample?: boolean;
  from?: string;
  to?: string;
  only?: string;
  budget?: string;
  costDriftThreshold?: string;
  reference?: string;
  nonInteractive?: boolean;
};

export async function loadRunTargetInput(target: string): Promise<LoadedRunTargetInput> {
  const projectRoot = findProjectRoot();
  const { show: showSlug, episode: episodeSlug } = parseShowEpisode(target, projectRoot);
  const show = await loadShow(projectRoot, showSlug);
  const episode = await loadEpisode(show, episodeSlug);
  assertEpisodeAgainstShow(episode, show);

  return {
    projectRoot,
    target,
    showSlug,
    episodeSlug,
    show,
    episode,
  };
}

export async function loadRunTarget(target: string, hint: PipelineSelectionHint = {}): Promise<LoadedRunTarget> {
  return selectRunTargetPipeline(await loadRunTargetInput(target), hint);
}

export async function selectRunTargetPipeline(
  input: LoadedRunTargetInput,
  hint: PipelineSelectionHint = {},
): Promise<LoadedRunTarget> {
  const selected = await selectPipeline(input, hint);

  return {
    ...input,
    pipelineName: selected.name,
    pipeline: selected.pipeline,
  };
}

async function selectPipeline(
  input: LoadedRunTargetInput,
  hint: PipelineSelectionHint,
): Promise<{ name: string; pipeline: Pipeline }> {
  const configuredPipeline = input.episode.pipeline ?? input.show.defaults.pipeline;
  if (input.episode.pipeline !== undefined || hint.videoAnalysisBrief === undefined) {
    return {
      name: configuredPipeline,
      pipeline: await loadPipeline(input.projectRoot, configuredPipeline),
    };
  }

  const pipelineNames = orderedPipelineNames(Object.keys(input.show.pipelines), configuredPipeline);
  const loaded = [];

  for (const name of pipelineNames) {
    const pipeline = await loadPipeline(input.projectRoot, name);
    loaded.push({ name, pipeline });
  }

  const fallback = loaded[0];
  if (fallback === undefined) {
    throw new Error("show.pipelines must declare at least one pipeline");
  }

  return loaded.find((candidate) => supportsReferenceInput(candidate.pipeline)) ?? fallback;
}

function orderedPipelineNames(names: string[], preferred: string): string[] {
  return [preferred, ...names.filter((name) => name !== preferred)];
}

function supportsReferenceInput(pipeline: Pipeline): boolean {
  const supported = recordValue(pipeline.reference_input)?.supported;
  if (supported === false) {
    return false;
  }
  if (supported === true) {
    return true;
  }

  return pipeline.stages.some((stage) => {
    return (
      stage.slug === "source_review" ||
      stage.produces === "source_media_review" ||
      stage.required_artifacts_in.includes("source_media_review") ||
      stage.optional_artifacts_in.includes("source_media_review") ||
      stage.skill.includes("source-review")
    );
  });
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

export function parseStageRunOptions(options: StageFlagOptions, pipeline: Pipeline): StageRunOptions {
  validateStageFlag("from", options.from, pipeline);
  validateStageFlag("to", options.to, pipeline);
  validateStageFlag("only", options.only, pipeline);

  const budgetUsd = parseBudget(options.budget);
  const costDriftThreshold = parsePositiveNumber("--cost-drift-threshold", options.costDriftThreshold);

  return {
    sample: options.sample === true,
    dryRun: options.dryRun === true,
    from: options.from,
    to: options.to,
    only: options.only,
    budget_usd: budgetUsd,
    cost_drift_threshold: costDriftThreshold,
    nonInteractive: options.nonInteractive === true,
  };
}

function validateStageFlag(flag: "from" | "to" | "only", value: string | undefined, pipeline: Pipeline): void {
  if (value === undefined) {
    return;
  }

  const slugs = pipeline.stages.map((stage) => stage.slug);
  if (!slugs.includes(value)) {
    throw new Error(`unknown stage '${value}' for --${flag}; expected one of: ${slugs.join(", ")}`);
  }
}

function parseBudget(value: string | undefined): number | undefined {
  return parsePositiveNumber("--budget", value);
}

function parsePositiveNumber(flag: string, value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${flag} must be a positive number, got '${value}'`);
  }

  return parsed;
}
