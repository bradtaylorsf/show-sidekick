import type { Command } from "commander";
import { getNextStage, readCheckpoint, updateState, writeCheckpoint } from "../../checkpoints/index.js";
import type { CliIo, GlobalOptions } from "./stub.js";
import { loadRunTarget } from "./run-target.js";

type ApproveEvent = {
  event: "stage_approved";
  command: "approve";
  target: string;
  show: string;
  episode: string;
  stage: string;
};

export function createApproveHandler(io: CliIo) {
  return async (target: string, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<GlobalOptions>();
    const loaded = await loadRunTarget(target);
    const next = await getNextStage(loaded.projectRoot, loaded.showSlug, loaded.episodeSlug, loaded.pipeline);

    if (next.kind !== "awaiting_human") {
      throw new Error(`no awaiting_human checkpoint to approve for ${target}`);
    }

    const timestamp = new Date().toISOString();
    const checkpoint = await readCheckpoint(loaded.projectRoot, loaded.showSlug, loaded.episodeSlug, next.stage.slug);
    await writeCheckpoint(loaded.projectRoot, loaded.showSlug, loaded.episodeSlug, next.stage.slug, {
      ...checkpoint,
      status: "completed",
      timestamp,
    });
    await updateState(loaded.projectRoot, loaded.showSlug, loaded.episodeSlug, {
      pipeline: loaded.pipelineName,
      current_stage: next.stage.slug,
      last_status: "completed",
      last_checkpoint_at: timestamp,
    });

    if (options.json) {
      const event: ApproveEvent = {
        event: "stage_approved",
        command: "approve",
        target,
        show: loaded.showSlug,
        episode: loaded.episodeSlug,
        stage: next.stage.slug,
      };
      io.stdout.write(`${JSON.stringify(event)}\n`);
      return;
    }

    io.stdout.write(`approve: ${next.stage.slug} advanced\n`);
  };
}
