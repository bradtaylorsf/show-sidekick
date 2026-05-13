import type { Command } from "commander";
import { findProjectRoot } from "../../paths/project.js";
import { loadPipeline } from "../../pipelines/load.js";
import { loadEpisode, loadShow } from "../../shows/load.js";
import {
  scaffoldEpisode,
  scaffoldPipeline,
  scaffoldPlaybook,
  scaffoldShow,
  type ScaffoldResult,
} from "../scaffold/index.js";
import type { CliIo, GlobalOptions } from "./stub.js";

type NewEvent = {
  event: "show_created" | "episode_created" | "pipeline_created" | "playbook_created";
  slug: string;
  path: string;
  show?: string;
  pipelines?: string[];
  pipeline?: string;
};

type NewShowOptions = GlobalOptions & {
  from?: string;
  pipelines?: string;
};

type NewEpisodeOptions = GlobalOptions & {
  pipeline?: string;
};

export function createNewHandlers(io: CliIo) {
  return {
    show: async (slug: string, ...actionArgs: unknown[]): Promise<void> => {
      const command = actionArgs.at(-1) as Command;
      const options = command.optsWithGlobals<NewShowOptions>();
      const projectRoot = findProjectRoot();
      const pipelines = parsePipelineList(options.pipelines);
      const result = await scaffoldShow(projectRoot, {
        slug,
        pipelines,
        fromStarter: options.from,
      });
      const show = await loadShow(projectRoot, result.slug);

      emitCreated(io, options, "show_created", result, { pipelines: Object.keys(show.pipelines) });
    },

    episode: async (showSlug: string, slug: string | undefined, ...actionArgs: unknown[]): Promise<void> => {
      const command = actionArgs.at(-1) as Command;
      const options = command.optsWithGlobals<NewEpisodeOptions>();
      const projectRoot = findProjectRoot();
      const show = await loadShow(projectRoot, showSlug);
      const result = await scaffoldEpisode(projectRoot, {
        show,
        slug,
        pipeline: options.pipeline,
      });
      const episode = await loadEpisode(show, result.slug);

      emitCreated(io, options, "episode_created", result, {
        show: showSlug,
        pipeline: episode.pipeline ?? show.defaults.pipeline,
      });
    },

    pipeline: async (slug: string, ...actionArgs: unknown[]): Promise<void> => {
      const command = actionArgs.at(-1) as Command;
      const options = command.optsWithGlobals<GlobalOptions>();
      const projectRoot = findProjectRoot();
      const result = await scaffoldPipeline(projectRoot, slug);
      await loadPipeline(projectRoot, result.slug);

      emitCreated(io, options, "pipeline_created", result);
    },

    playbook: async (slug: string, ...actionArgs: unknown[]): Promise<void> => {
      const command = actionArgs.at(-1) as Command;
      const options = command.optsWithGlobals<GlobalOptions>();
      const projectRoot = findProjectRoot();
      const result = await scaffoldPlaybook(projectRoot, slug);

      emitCreated(io, options, "playbook_created", result);
    },
  };
}

function emitCreated(
  io: CliIo,
  options: GlobalOptions,
  event: NewEvent["event"],
  result: ScaffoldResult,
  extra: Omit<NewEvent, "event" | "slug" | "path"> = {},
): void {
  if (options.json) {
    const payload: NewEvent = {
      event,
      slug: result.slug,
      path: result.filePath,
      ...extra,
    };
    io.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  const kind = event.replace("_created", "").replace("_", " ");
  io.stdout.write(`new ${kind}: wrote ${result.filePath}\n`);
}

function parsePipelineList(value: string | undefined): string[] | undefined {
  if (value === undefined) {
    return undefined;
  }

  const pipelines = value
    .split(",")
    .map((pipeline) => pipeline.trim())
    .filter(Boolean);

  if (pipelines.length === 0) {
    throw new Error("--pipelines must include at least one pipeline slug");
  }

  return pipelines;
}
