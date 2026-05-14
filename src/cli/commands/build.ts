import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import type { Command } from "commander";
import { z } from "zod";
import type { VideoAnalysisBrief } from "../../artifacts/index.js";
import { loadYaml } from "../../config/loader.js";
import {
  analyzeReference,
  awaitStageEvent,
  createExternalAgentDispatcher,
  resolveReferenceSource,
  Runner,
  type ApprovalPromptResult,
  type Dispatcher,
  type ReferenceSource,
  type RunnerOptions,
  type RunnerResult,
} from "../../harness/index.js";
import { resolve as resolveProjectResource } from "../../paths/project.js";
import { Registry } from "../../registry/index.js";
import { deepMerge } from "../../shows/deep-merge.js";
import { PlaybookSchema } from "../../shows/playbook.js";
import type { CliIo, GlobalOptions } from "./stub.js";
import { loadRunTarget, parseStageRunOptions, type LoadedRunTarget, type StageFlagOptions } from "./run-target.js";

type BuildFinishedEvent = {
  event: "build_finished";
  command: "build";
  target: string;
  show: string;
  episode: string;
  pipeline: string;
  status: RunnerResult["status"];
  last_stage?: string;
  total_cost_usd: number;
  warnings: RunnerResult["warnings"];
  decisions: RunnerResult["decisions"];
};

export type BuildHandlerOptions = {
  registryFactory?: (loaded: LoadedRunTarget) => Registry | Promise<Registry>;
  referenceResolver?: (input: {
    source: ReferenceSource;
    loaded: LoadedRunTarget;
    registry: Registry;
    io: CliIo;
    json: boolean;
    now?: () => Date;
  }) => VideoAnalysisBrief | Promise<VideoAnalysisBrief>;
  dispatcherFactory?: (input: {
    loaded: LoadedRunTarget;
    registry: Registry;
    io: CliIo;
    options: StageFlagOptions;
    now?: () => Date;
  }) => Dispatcher | Promise<Dispatcher>;
  reviewer?: RunnerOptions["reviewer"];
  prompt?: RunnerOptions["prompt"];
  playbookResolver?: (loaded: LoadedRunTarget) => unknown | Promise<unknown>;
  now?: () => Date;
};

export function createBuildHandler(io: CliIo, handlerOptions: BuildHandlerOptions = {}) {
  return async (target: string, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<GlobalOptions>() as StageFlagOptions;
    const loaded = await loadRunTarget(target);
    const runOptions = parseStageRunOptions(options, loaded.pipeline);
    const registry = await (handlerOptions.registryFactory ?? defaultRegistryFactory)(loaded);
    const referenceSource = resolveReferenceSource(referenceValue(options, loaded), {
      projectRoot: loaded.projectRoot,
      cwd: process.cwd(),
    });
    const videoAnalysisBrief =
      referenceSource === undefined
        ? undefined
        : await (handlerOptions.referenceResolver ?? defaultReferenceResolver)({
            source: referenceSource,
            loaded,
            registry,
            io,
            json: options.json === true,
            now: handlerOptions.now,
          });
    const dispatcher = await (handlerOptions.dispatcherFactory ?? defaultDispatcherFactory)({
      loaded,
      registry,
      io,
      options,
      now: handlerOptions.now,
    });
    const playbook = await (handlerOptions.playbookResolver ?? resolvePlaybook)(loaded);
    const prompt =
      handlerOptions.prompt ?? (runOptions.nonInteractive || options.json ? undefined : createReadlineApprovalPrompt());
    const result = await Runner.run({
      projectRoot: loaded.projectRoot,
      show: loaded.show,
      episode: loaded.episode,
      pipeline: loaded.pipeline,
      pipelineName: loaded.pipelineName,
      playbook,
      registry,
      dispatcher,
      reviewer: handlerOptions.reviewer,
      runOptions,
      io,
      json: options.json === true,
      now: handlerOptions.now,
      prompt,
      videoAnalysisBrief,
    });

    emitBuildFinished(io, options, target, loaded, result);
  };
}

async function defaultRegistryFactory(): Promise<Registry> {
  const registry = new Registry();
  await registry.discover();
  return registry;
}

async function defaultReferenceResolver(input: {
  source: ReferenceSource;
  loaded: LoadedRunTarget;
  registry: Registry;
  io: CliIo;
  json: boolean;
  now?: () => Date;
}): Promise<VideoAnalysisBrief> {
  return analyzeReference({
    source: input.source,
    registry: input.registry,
    projectRoot: input.loaded.projectRoot,
    show: input.loaded.show,
    episode: input.loaded.episode,
    io: input.io,
    json: input.json,
    now: input.now,
  });
}

function defaultDispatcherFactory(input: {
  io: CliIo;
  options: StageFlagOptions;
  now?: () => Date;
}): Dispatcher {
  return createExternalAgentDispatcher({
    now: input.now,
    emit(event) {
      input.io.stdout.write(`${JSON.stringify(event)}\n`);
    },
    wait(predicate) {
      return awaitStageEvent(process.stdin, predicate);
    },
  });
}

function referenceValue(options: StageFlagOptions, loaded: LoadedRunTarget): string | undefined {
  if (options.reference !== undefined) {
    return options.reference;
  }

  const episodeReference = loaded.episode.inputs.reference;
  return typeof episodeReference === "string" ? episodeReference : undefined;
}

async function resolvePlaybook(loaded: LoadedRunTarget): Promise<unknown> {
  const pipelineConfig = loaded.show.pipelines[loaded.pipelineName];
  const playbookName = loaded.episode.playbook ?? pipelineConfig?.playbook;

  if (playbookName === undefined) {
    return undefined;
  }

  const playbookPath = resolveProjectResource("playbooks", playbookName, loaded.projectRoot);
  if (!existsSync(playbookPath)) {
    return undefined;
  }

  let playbook = await loadYaml(playbookPath, PlaybookSchema);
  if (pipelineConfig?.playbook_overrides !== undefined) {
    const overridesPath = path.resolve(loaded.show.rootDir, pipelineConfig.playbook_overrides);
    const overrides = await loadYaml(overridesPath, z.unknown());
    playbook = PlaybookSchema.parse(deepMerge(playbook, overrides));
  }

  return playbook;
}

function createReadlineApprovalPrompt(): RunnerOptions["prompt"] {
  return async (): Promise<ApprovalPromptResult> => {
    const readline = createInterface({ input: process.stdin, output: process.stdout });

    try {
      const action = normalizeAction(await readline.question("Action (approve/revise/abort): "));
      if (action !== "revise") {
        return action;
      }

      const note = (await readline.question("Revision note: ")).trim();
      return { action, note: note.length > 0 ? note : undefined };
    } finally {
      readline.close();
    }
  };
}

function normalizeAction(value: string): "approve" | "revise" | "abort" {
  const normalized = value.trim().toLowerCase();

  if (normalized === "approve" || normalized === "a" || normalized === "yes" || normalized === "y") {
    return "approve";
  }
  if (normalized === "revise" || normalized === "r") {
    return "revise";
  }
  if (normalized === "abort" || normalized === "quit" || normalized === "q") {
    return "abort";
  }

  throw new Error(`unknown approval action '${value}'; expected approve, revise, or abort`);
}

function emitBuildFinished(
  io: CliIo,
  options: StageFlagOptions,
  target: string,
  loaded: LoadedRunTarget,
  result: RunnerResult,
): void {
  if (options.json) {
    const event: BuildFinishedEvent = {
      event: "build_finished",
      command: "build",
      target,
      show: loaded.showSlug,
      episode: loaded.episodeSlug,
      pipeline: loaded.pipelineName,
      status: result.status,
      last_stage: result.lastStage,
      total_cost_usd: result.totalCostUsd,
      warnings: result.warnings,
      decisions: result.decisions,
    };
    io.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }

  const lastStage = result.lastStage ? ` last_stage=${result.lastStage}` : "";
  io.stdout.write(`build: ${result.status} for ${loaded.showSlug}/${loaded.episodeSlug}${lastStage}\n`);
}
