import type { StageRunOptions } from "../../harness/context.js";
import { loadPipeline } from "../../pipelines/load.js";
import type { Pipeline } from "../../pipelines/manifest.js";
import { findProjectRoot, parseShowEpisode } from "../../paths/project.js";
import { assertEpisodeAgainstShow, loadEpisode, loadShow, type LoadedEpisode, type LoadedShow } from "../../shows/index.js";
import type { GlobalOptions } from "./stub.js";

export type LoadedRunTarget = {
  projectRoot: string;
  target: string;
  showSlug: string;
  episodeSlug: string;
  show: LoadedShow;
  episode: LoadedEpisode;
  pipelineName: string;
  pipeline: Pipeline;
};

export type StageFlagOptions = GlobalOptions & {
  sample?: boolean;
  from?: string;
  to?: string;
  only?: string;
  budget?: string;
  reference?: string;
  nonInteractive?: boolean;
};

export async function loadRunTarget(target: string): Promise<LoadedRunTarget> {
  const projectRoot = findProjectRoot();
  const { show: showSlug, episode: episodeSlug } = parseShowEpisode(target, projectRoot);
  const show = await loadShow(projectRoot, showSlug);
  const episode = await loadEpisode(show, episodeSlug);
  assertEpisodeAgainstShow(episode, show);
  const pipelineName = episode.pipeline ?? show.defaults.pipeline;
  const pipeline = await loadPipeline(projectRoot, pipelineName);

  return {
    projectRoot,
    target,
    showSlug,
    episodeSlug,
    show,
    episode,
    pipelineName,
    pipeline,
  };
}

export function parseStageRunOptions(options: StageFlagOptions, pipeline: Pipeline): StageRunOptions {
  validateStageFlag("from", options.from, pipeline);
  validateStageFlag("to", options.to, pipeline);
  validateStageFlag("only", options.only, pipeline);

  const budgetUsd = parseBudget(options.budget);

  return {
    sample: options.sample === true,
    dryRun: options.dryRun === true,
    from: options.from,
    to: options.to,
    only: options.only,
    budget_usd: budgetUsd,
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
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`--budget must be a positive USD amount, got '${value}'`);
  }

  return parsed;
}
