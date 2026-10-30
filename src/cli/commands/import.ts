import path from "node:path";
import { realpath } from "node:fs/promises";
import type { Command } from "commander";
import { findProjectRoot, parseShowEpisode } from "../../paths/project.js";
import { resolveDropMatch, showIngestWatchEntries } from "../../shows/ingest.js";
import { loadShow } from "../../shows/load.js";
import { writeEpisodeFromDrop } from "../scaffold/from-drop.js";
import { assertMissing } from "../scaffold/index.js";
import type { CliIo, GlobalOptions } from "./stub.js";

type ImportOptions = GlobalOptions & {
  as?: string;
};

type ImportDeps = {
  cwd?: () => string;
};

type ImportEvent = {
  event: "episode_imported";
  show: string;
  episode: string;
  pipeline: string;
  path: string;
  inputs: Record<string, string>;
};

export function createImportHandler(io: CliIo, deps: ImportDeps = {}) {
  return async (pathArg: string, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<ImportOptions>();
    const targetSpec = options.as;

    if (!targetSpec) {
      throw new Error("missing required option '--as <show>/<episode>'");
    }

    const cwd = deps.cwd?.() ?? process.cwd();
    const projectRoot = findProjectRoot(cwd);
    const target = parseShowEpisode(targetSpec, projectRoot);
    const show = await loadShow(projectRoot, target.show);
    const dropPath = await resolveExistingPath(path.resolve(cwd, pathArg));
    const match = await resolveDropMatch(dropPath, showIngestWatchEntries(show));

    if (!match) {
      throw new Error(
        `no ingest.watch[] entry in ${path.join(show.rootDir, "show.yaml")} matches ${pathArg}`,
      );
    }

    await assertMissing(target.episodeFile, "episode");

    const written = await writeEpisodeFromDrop(show, target.episode, match);
    emitImported(io, options, {
      event: "episode_imported",
      show: target.show,
      episode: target.episode,
      pipeline: written.pipeline,
      path: written.path,
      inputs: written.inputs,
    });
  };
}

async function resolveExistingPath(inputPath: string): Promise<string> {
  return realpath(inputPath);
}

function emitImported(io: CliIo, options: GlobalOptions, event: ImportEvent): void {
  if (options.json) {
    io.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }

  io.stdout.write(`import: wrote ${event.path}\n`);
}
