import type { Command } from "commander";
import {
  CheckpointMissingError,
  latestSampleVersion,
  readSampleCheckpoint,
  readState,
  sampleCheckpointFile,
  stateFile,
  writeSampleCheckpoint,
} from "../../checkpoints/index.js";
import { findProjectRoot, parseShowEpisode } from "../../paths/project.js";
import type { CliIo, GlobalOptions } from "./stub.js";

type ReviseEvent = {
  event: "sample_revised";
  command: "revise";
  target: string;
  show: string;
  episode: string;
  version: number;
  revision_note: string;
  checkpoint_path: string;
};

export function createReviseHandler(io: CliIo) {
  return async (target: string, note: string, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<GlobalOptions>();
    const projectRoot = findProjectRoot();
    const { show, episode } = parseShowEpisode(target, projectRoot);
    const state = await readState(projectRoot, show, episode);

    if (!state) {
      throw new CheckpointMissingError(stateFile(projectRoot, show, episode));
    }

    const previousVersion = latestSampleVersion(state);
    const nextVersion = previousVersion + 1;
    const previous = previousVersion > 0 ? await readPreviousSample(projectRoot, show, episode, previousVersion) : undefined;
    const checkpoint = await writeSampleCheckpoint(projectRoot, show, episode, nextVersion, {
      cost_for_this_sample: previous?.cost_for_this_sample ?? 0,
      cumulative_sample_cost: previous?.cumulative_sample_cost ?? 0,
      projected_full_cost: previous?.projected_full_cost ?? 0,
      sample_video_path: previous?.sample_video_path ?? "",
      revision_note: note,
    });
    const checkpointPath = sampleCheckpointFile(projectRoot, show, episode, checkpoint.version);

    if (options.json) {
      const event: ReviseEvent = {
        event: "sample_revised",
        command: "revise",
        target,
        show,
        episode,
        version: checkpoint.version,
        revision_note: note,
        checkpoint_path: checkpointPath,
      };
      io.stdout.write(`${JSON.stringify(event)}\n`);
      return;
    }

    io.stdout.write(`revise: wrote sample_v${checkpoint.version} for ${show}/${episode}\n`);
  };
}

async function readPreviousSample(projectRoot: string, show: string, episode: string, version: number) {
  try {
    return await readSampleCheckpoint(projectRoot, show, episode, version);
  } catch (error) {
    if (error instanceof CheckpointMissingError) {
      return undefined;
    }

    throw error;
  }
}
