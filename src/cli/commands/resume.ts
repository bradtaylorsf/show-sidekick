import type { Command } from "commander";
import { getNextStage, type NextStage } from "../../checkpoints/index.js";
import type { CliIo, GlobalOptions } from "./stub.js";
import { loadRunTarget } from "./run-target.js";

type ResumeEvent = {
  event: "resume_next";
  command: "resume";
  target: string;
  show: string;
  episode: string;
  kind: NextStage["kind"];
  stage?: string;
};

export function createResumeHandler(io: CliIo) {
  return async (target: string, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<GlobalOptions>();
    const loaded = await loadRunTarget(target);
    const next = await getNextStage(loaded.projectRoot, loaded.showSlug, loaded.episodeSlug, loaded.pipeline);

    if (options.json) {
      const event: ResumeEvent = {
        event: "resume_next",
        command: "resume",
        target,
        show: loaded.showSlug,
        episode: loaded.episodeSlug,
        kind: next.kind,
        stage: "stage" in next ? next.stage.slug : undefined,
      };
      io.stdout.write(`${JSON.stringify(event)}\n`);
      return;
    }

    const stage = "stage" in next ? next.stage.slug : "none";
    io.stdout.write(`resume: next stage = ${stage} (status=${next.kind})\n`);
  };
}
