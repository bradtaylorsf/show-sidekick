import type { Command } from "commander";
import {
  CheckpointMissingError,
  getNextStage,
  latestSampleVersion,
  readSampleCheckpoint,
  readState,
  sampleCheckpointFile,
  stateFile,
  updateState,
  writeSampleCheckpoint,
} from "../../checkpoints/index.js";
import { findProjectRoot, parseShowEpisode } from "../../paths/project.js";
import { assertBuild, supersedeFrom } from "../../queue/queue.js";
import type { CliIo, GlobalOptions } from "./stub.js";
import { loadRunTarget } from "./run-target.js";

type ReviseOptions = GlobalOptions & {
  stage?: string;
  build?: string;
};

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

type SendBackEvent = {
  event: "stage_sent_back";
  command: "revise";
  target: string;
  show: string;
  episode: string;
  stage: string;
  from_stage: string;
  superseded: string[];
  build: string | null;
  revision_note: string;
};

export function createReviseHandler(io: CliIo) {
  return async (target: string, note: string, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<ReviseOptions>();
    if (options.stage !== undefined) {
      await sendBackToStage(target, note, options.stage, options, io);
      return;
    }

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
      if (options.build !== undefined) {
        const loaded = await loadRunTarget(target);
        await assertBuild(projectRoot, show, episode, loaded.pipeline, options.build);
      }
      const revisionNotes = {
        ...(state.revision_notes ?? {}),
        [state.current_stage]: [...(state.revision_notes?.[state.current_stage] ?? []), note],
      };
      await updateState(projectRoot, show, episode, {
        revision_notes: revisionNotes,
        queued_stage_revision: {
          stage: state.current_stage,
          note,
          queued_at: new Date().toISOString(),
        },
      });

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

/**
 * `revise --stage <slug>`: the human's notes on a cut go back to an earlier stage. That stage and every later
 * checkpoint are superseded (moved aside, not deleted) so the next build reruns from there with the note.
 */
async function sendBackToStage(target: string, note: string, stage: string, options: ReviseOptions, io: CliIo): Promise<void> {
  const trimmed = note.trim();
  if (trimmed.length === 0) {
    throw new Error("revise requires a non-empty note");
  }

  const loaded = await loadRunTarget(target);
  const { projectRoot, showSlug: show, episodeSlug: episode, pipeline } = loaded;
  const next = await getNextStage(projectRoot, show, episode, pipeline);
  if (next.kind !== "awaiting_human" && next.kind !== "failed") {
    throw new Error(`no awaiting_human or failed checkpoint to revise for ${target}`);
  }

  const stageIndex = pipeline.stages.findIndex((candidate) => candidate.slug === stage);
  const blockedIndex = pipeline.stages.findIndex((candidate) => candidate.slug === next.stage.slug);
  if (stageIndex === -1) {
    throw new Error(`unknown stage '${stage}' (stages: ${pipeline.stages.map((candidate) => candidate.slug).join(", ")})`);
  }
  if (stageIndex > blockedIndex) {
    throw new Error(`--stage ${stage} comes after the blocked stage '${next.stage.slug}'`);
  }

  const build = await assertBuild(projectRoot, show, episode, pipeline, options.build);
  const timestamp = new Date().toISOString();
  const state = await readState(projectRoot, show, episode);
  const superseded = await supersedeFrom(projectRoot, show, episode, pipeline, stage, timestamp);
  const isFinalGate = pipeline.stages.at(-1)?.slug === next.stage.slug;
  await updateState(projectRoot, show, episode, {
    pipeline: loaded.pipelineName,
    current_stage: stage,
    last_status: undefined,
    revision_notes: {
      ...(state?.revision_notes ?? {}),
      [stage]: [...(state?.revision_notes?.[stage] ?? []), trimmed],
    },
    queued_stage_revision: { stage, note: trimmed, queued_at: timestamp },
    ...(isFinalGate ? { review: { decision: "changes" as const, at: timestamp, build, stage, note: trimmed } } : {}),
  });

  if (options.json) {
    const event: SendBackEvent = {
      event: "stage_sent_back",
      command: "revise",
      target,
      show,
      episode,
      stage,
      from_stage: next.stage.slug,
      superseded,
      build,
      revision_note: trimmed,
    };
    io.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }

  io.stdout.write(`revise: ${target} sent back to ${stage}; rerun with showkick build ${target}\n`);
}
