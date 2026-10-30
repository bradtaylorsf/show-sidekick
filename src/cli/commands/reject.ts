import type { Command } from "commander";
import { getNextStage, updateState } from "../../checkpoints/index.js";
import { assertBuild } from "../../queue/queue.js";
import type { CliIo, GlobalOptions } from "./stub.js";
import { loadRunTarget } from "./run-target.js";

type RejectOptions = GlobalOptions & {
  build?: string;
};

type RejectEvent = {
  event: "episode_rejected";
  command: "reject";
  target: string;
  show: string;
  episode: string;
  stage: string;
  build: string | null;
  note: string;
};

export function createRejectHandler(io: CliIo) {
  return async (target: string, note: string, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<RejectOptions>();
    const trimmed = note.trim();
    if (trimmed.length === 0) {
      throw new Error("reject requires a non-empty note");
    }

    const loaded = await loadRunTarget(target);
    const next = await getNextStage(loaded.projectRoot, loaded.showSlug, loaded.episodeSlug, loaded.pipeline);
    if (next.kind !== "awaiting_human" && next.kind !== "failed") {
      throw new Error(`no awaiting_human or failed checkpoint to reject for ${target}`);
    }

    const build = await assertBuild(loaded.projectRoot, loaded.showSlug, loaded.episodeSlug, loaded.pipeline, options.build);
    const at = new Date().toISOString();
    await updateState(loaded.projectRoot, loaded.showSlug, loaded.episodeSlug, {
      pipeline: loaded.pipelineName,
      review: { decision: "rejected", at, build, stage: next.stage.slug, note: trimmed },
    });

    if (options.json) {
      const event: RejectEvent = {
        event: "episode_rejected",
        command: "reject",
        target,
        show: loaded.showSlug,
        episode: loaded.episodeSlug,
        stage: next.stage.slug,
        build,
        note: trimmed,
      };
      io.stdout.write(`${JSON.stringify(event)}\n`);
      return;
    }

    io.stdout.write(`reject: ${target} rejected at ${next.stage.slug}\n`);
  };
}
