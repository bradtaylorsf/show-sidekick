import { existsSync } from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { CommanderError, type Command } from "commander";
import { z } from "zod";
import type { VideoAnalysisBrief } from "../../artifacts/index.js";
import { BRANDING } from "../../branding.js";
import { loadYaml } from "../../config/loader.js";
import {
  analyzeReference,
  awaitStageEvent,
  createExternalAgentDispatcher,
  resolveReferenceSource,
  Runner,
  type ApprovalAction,
  type ApprovalPromptResult,
  type Dispatcher,
  type ReferenceSource,
  type RunnerOptions,
  type RunnerResult,
} from "../../harness/index.js";
import { createPaidSampleDispatcher } from "../../harness/paid-sample.js";
import { createStarterSampleDispatcher } from "../../harness/starter-sample.js";
import { resolve as resolveProjectResource } from "../../paths/project.js";
import { loadProjectPlaybook } from "../../playbooks/project-loader.js";
import { recordDecision } from "../../decisions/store.js";
import { buildProviderProfileDecision, getProviderProfile, providerProfileNames } from "../../providers/profiles.js";
import { Registry } from "../../registry/index.js";
import { deepMerge } from "../../shows/deep-merge.js";
import { PlaybookSchema } from "../../shows/playbook.js";
import type { CliIo, GlobalOptions } from "./stub.js";
import {
  loadRunTargetInput,
  parseStageRunOptions,
  selectRunTargetPipeline,
  type LoadedRunTarget,
  type LoadedRunTargetInput,
  type StageFlagOptions,
} from "./run-target.js";

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
  registryFactory?: (loaded: LoadedRunTargetInput) => Registry | Promise<Registry>;
  referenceResolver?: (input: {
    source: ReferenceSource;
    loaded: LoadedRunTargetInput;
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
    runOptions: ReturnType<typeof parseStageRunOptions>;
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
    const input = await loadRunTargetInput(target);
    const registry = await (handlerOptions.registryFactory ?? defaultRegistryFactory)(input);
    const referenceSource = resolveReferenceSource(referenceValue(options, input), {
      projectRoot: input.projectRoot,
      cwd: process.cwd(),
    });
    const videoAnalysisBrief =
      referenceSource === undefined
        ? undefined
        : await (handlerOptions.referenceResolver ?? defaultReferenceResolver)({
            source: referenceSource,
            loaded: input,
            registry,
            io,
            json: options.json === true,
            now: handlerOptions.now,
          });
    const loaded = await selectRunTargetPipeline(input, { videoAnalysisBrief });
    const runOptions = parseStageRunOptions(options, loaded);
    ensureSampleSupport({ command, io, loaded, runOptions, json: options.json === true });
    await recordProviderProfileSelection(runOptions.provider_profile, loaded, handlerOptions.now);
    const dispatcher = await (handlerOptions.dispatcherFactory ?? defaultDispatcherFactory)({
      loaded,
      registry,
      io,
      options,
      runOptions,
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

async function recordProviderProfileSelection(
  providerProfile: string | undefined,
  loaded: LoadedRunTarget,
  now: (() => Date) | undefined,
): Promise<void> {
  if (providerProfile === undefined) {
    return;
  }

  const profile = getProviderProfile(providerProfile);
  if (profile === undefined) {
    throw new Error(`unknown provider profile "${providerProfile}"; expected one of: ${providerProfileNames().join(", ")}`);
  }

  await recordDecision(
    { show: loaded.showSlug, episode: loaded.episodeSlug },
    buildProviderProfileDecision({
      profile,
      timestamp: (now ?? (() => new Date()))().toISOString(),
    }),
    { root: loaded.projectRoot },
  );
}

async function defaultRegistryFactory(_loaded: LoadedRunTargetInput): Promise<Registry> {
  const registry = new Registry();
  await registry.discover();
  return registry;
}

async function defaultReferenceResolver(input: {
  source: ReferenceSource;
  loaded: LoadedRunTargetInput;
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
  loaded: LoadedRunTarget;
  io: CliIo;
  options: StageFlagOptions;
  runOptions: ReturnType<typeof parseStageRunOptions>;
  now?: () => Date;
}): Dispatcher {
  if (input.runOptions.sample === true && input.runOptions.provider_profile !== undefined && sampleSupportIncludes(input.loaded, "paid")) {
    return createPaidSampleDispatcher({
      providerProfile: input.runOptions.provider_profile,
      now: input.now,
    });
  }

  if (input.runOptions.sample === true && sampleSupportIncludes(input.loaded, "zero-key")) {
    return createStarterSampleDispatcher();
  }

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

function ensureSampleSupport(input: {
  command: Command;
  io: CliIo;
  loaded: LoadedRunTarget;
  runOptions: ReturnType<typeof parseStageRunOptions>;
  json: boolean;
}): void {
  if (input.runOptions.sample !== true) {
    return;
  }

  const support = resolvedSampleSupport(input.loaded);
  if (input.runOptions.provider_profile !== undefined) {
    if (sampleSupportAllows(support, "paid")) {
      return;
    }

    emitSampleUnsupported(input, `pipeline '${input.loaded.pipelineName}' does not support paid-provider samples`);
    throw sampleUnsupported(`sample unsupported: ${input.loaded.pipelineName} does not support paid-provider samples`, input.io);
  }

  if (sampleSupportAllows(support, "zero-key")) {
    return;
  }

  const reason =
    support === "unsupported"
      ? `pipeline '${input.loaded.pipelineName}' declares sample_support: unsupported`
      : `pipeline '${input.loaded.pipelineName}' requires a provider profile for sample mode`;
  emitSampleUnsupported(input, reason);
  throw sampleUnsupported(`sample unsupported: ${reason}`, input.io);
}

function sampleUnsupported(message: string, io: CliIo): CommanderError {
  io.stderr.write(`${message}\n`);
  return new CommanderError(2, `${BRANDING.packageName}.sample_unsupported`, message);
}

function emitSampleUnsupported(input: {
  io: CliIo;
  loaded: LoadedRunTarget;
  runOptions: ReturnType<typeof parseStageRunOptions>;
  json: boolean;
}, reason: string): void {
  const payload = {
    event: "sample_unsupported",
    show: input.loaded.show.slug,
    episode: input.loaded.episode.slug,
    pipeline: input.loaded.pipelineName,
    sample_support: resolvedSampleSupport(input.loaded),
    provider_profile: input.runOptions.provider_profile,
    reason,
    exit_code: 2,
  };

  input.io.stdout.write(`${JSON.stringify(payload)}\n`);
}

function sampleSupportIncludes(loaded: LoadedRunTarget, mode: "zero-key" | "paid"): boolean {
  return sampleSupportAllows(resolvedSampleSupport(loaded), mode);
}

function sampleSupportAllows(support: "zero-key" | "paid" | "both" | "unsupported", mode: "zero-key" | "paid"): boolean {
  return support === "both" || support === mode;
}

function resolvedSampleSupport(loaded: LoadedRunTarget): "zero-key" | "paid" | "both" | "unsupported" {
  return loaded.show.sample_support ?? loaded.pipeline.sample_support ?? legacySampleSupport(loaded.pipeline);
}

function legacySampleSupport(pipeline: LoadedRunTarget["pipeline"]): "zero-key" | "paid" | "both" | "unsupported" {
  const metadata = pipeline.metadata;
  const zeroKey =
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    metadata.starter_sample_dispatcher === "zero-key";

  if (zeroKey) {
    return "zero-key";
  }

  return pipeline.sample === undefined ? "unsupported" : "paid";
}

function referenceValue(options: StageFlagOptions, loaded: LoadedRunTargetInput): string | undefined {
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

  const projectPlaybook = await loadProjectPlaybook(loaded.projectRoot, playbookName);
  const playbookPath = resolveProjectResource("playbooks", playbookName, loaded.projectRoot);
  if (projectPlaybook === undefined && !existsSync(playbookPath)) {
    return undefined;
  }

  let playbook: unknown = projectPlaybook ?? (await loadYaml(playbookPath, PlaybookSchema));
  if (pipelineConfig?.playbook_overrides !== undefined) {
    const overridesPath = path.resolve(loaded.show.rootDir, pipelineConfig.playbook_overrides);
    const overrides = await loadYaml(overridesPath, z.unknown());
    playbook = PlaybookSchema.parse(deepMerge(playbook, overrides));
  }

  return playbook;
}

function createReadlineApprovalPrompt(): RunnerOptions["prompt"] {
  return async (_checkpoint, approvalCtx): Promise<ApprovalPromptResult> => {
    const readline = createInterface({ input: process.stdin, output: process.stdout });

    try {
      const question =
        approvalCtx.kind === "sample-first"
          ? "Action (sample/downgrade/abort): "
          : "Action (approve/revise/abort): ";
      const action = normalizeAction(await readline.question(question));
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

function normalizeAction(value: string): ApprovalAction {
  const normalized = value.trim().toLowerCase();

  if (normalized === "approve" || normalized === "a" || normalized === "yes" || normalized === "y") {
    return "approve";
  }
  if (normalized === "sample" || normalized === "s") {
    return "sample";
  }
  if (normalized === "downgrade" || normalized === "skip" || normalized === "d") {
    return "downgrade";
  }
  if (normalized === "revise" || normalized === "r") {
    return "revise";
  }
  if (normalized === "abort" || normalized === "quit" || normalized === "q") {
    return "abort";
  }

  throw new Error(`unknown approval action '${value}'; expected approve, revise, sample, downgrade, or abort`);
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
