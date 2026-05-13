import type { Command } from "commander";
import type { StageRunOptions } from "../../harness/context.js";
import type { CliIo, GlobalOptions } from "./stub.js";
import { loadRunTarget, parseStageRunOptions, type StageFlagOptions } from "./run-target.js";

type BuildEvent = {
  event: "build_planned";
  command: "build";
  target: string;
  show: string;
  episode: string;
  pipeline: string;
  run_options: StageRunOptions;
};

export function createBuildHandler(io: CliIo) {
  return async (target: string, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<GlobalOptions>() as StageFlagOptions;
    const loaded = await loadRunTarget(target);
    const runOptions = parseStageRunOptions(options, loaded.pipeline);

    if (options.json) {
      const event: BuildEvent = {
        event: "build_planned",
        command: "build",
        target,
        show: loaded.showSlug,
        episode: loaded.episodeSlug,
        pipeline: loaded.pipelineName,
        run_options: runOptions,
      };
      io.stdout.write(`${JSON.stringify(event)}\n`);
      return;
    }

    io.stdout.write(
      [
        `build: Runner integration pending (Epic 9) for ${loaded.showSlug}/${loaded.episodeSlug}`,
        `pipeline: ${loaded.pipelineName}`,
        `stages: ${describeStages(runOptions)}`,
      ].join("\n") + "\n",
    );
  };
}

function describeStages(runOptions: StageRunOptions): string {
  if (runOptions.only) {
    return runOptions.only;
  }

  if (runOptions.from || runOptions.to) {
    return `${runOptions.from ?? "first"}..${runOptions.to ?? "last"}`;
  }

  return "all";
}
