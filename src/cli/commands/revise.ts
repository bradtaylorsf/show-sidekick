import type { Command } from "commander";
import {
  CheckpointMissingError,
  latestSampleVersion,
  readSampleCheckpoint,
  readState,
  sampleCheckpointFile,
  stateFile,
  updateState,
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

type StageRevisionEvent = {
  event: "stage_revision_queued";
  command: "revise";
  target: string;
  show: string;
  episode: string;
  stage: string;
  revision_note: string;
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

    if (previousVersion > 0) {
      const nextVersion = previousVersion + 1;
      const previous = await readSampleCheckpoint(projectRoot, show, episode, previousVersion);
      const checkpoint = await writeSampleCheckpoint(projectRoot, show, episode, nextVersion, {
        cost_for_this_sample: previous.cost_for_this_sample,
        cumulative_sample_cost: previous.cumulative_sample_cost,
        projected_full_cost: previous.projected_full_cost,
        sample_video_path: previous.sample_video_path,
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
      return;
    }

    // current_stage is historical after approve; only queue a stage revision while the stage is actually blocked.
    if (state.current_stage && isRevisableStageStatus(state.last_status)) {
      const revisionNotes = {
        ...(state.revision_notes ?? {}),
        [state.current_stage]: [...(state.revision_notes?.[state.current_stage] ?? []), note],
      };
      await updateState(projectRoot, show, episode, { revision_notes: revisionNotes });

      if (options.json) {
        const event: StageRevisionEvent = {
          event: "stage_revision_queued",
          command: "revise",
          target,
          show,
          episode,
          stage: state.current_stage,
          revision_note: note,
        };
        io.stdout.write(`${JSON.stringify(event)}\n`);
        return;
      }

      io.stdout.write(`revise: appended note to ${state.current_stage}\n`);
      return;
    }

    throw new Error(`no awaiting sample or stage revision to revise for ${target}`);
  };
}

function isRevisableStageStatus(status: string | undefined): boolean {
  return status === "awaiting_human" || status === "failed";
}
