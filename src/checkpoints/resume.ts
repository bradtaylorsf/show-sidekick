import type { Pipeline } from "../pipelines/manifest.js";
import type { Stage } from "../pipelines/stage.js";
import type { Checkpoint } from "./checkpoint.js";
import { listCheckpoints, readCheckpoint } from "./io.js";

export type NextStage =
  | { kind: "run"; stage: Stage }
  | { kind: "awaiting_human"; stage: Stage }
  | { kind: "failed"; stage: Stage }
  | { kind: "crashed"; stage: Stage }
  | { kind: "done" };

type PipelineCheckpoint = {
  stage: Stage;
  stageIndex: number;
  checkpoint: Checkpoint;
};

export async function getNextStage(
  projectRoot: string,
  show: string,
  episode: string,
  pipeline: Pipeline,
): Promise<NextStage> {
  const firstStage = pipeline.stages[0];
  const stageIndexBySlug = new Map(pipeline.stages.map((stage, index) => [stage.slug, index]));
  const checkpointStages = await listCheckpoints(projectRoot, show, episode);

  if (!firstStage) {
    return { kind: "done" };
  }

  const pipelineCheckpoints: PipelineCheckpoint[] = [];
  for (const checkpointStage of checkpointStages) {
    const stageIndex = stageIndexBySlug.get(checkpointStage);

    if (stageIndex === undefined) {
      continue;
    }

    const checkpoint = await readCheckpoint(projectRoot, show, episode, checkpointStage);
    const stage = pipeline.stages[stageIndex];

    if (stage) {
      pipelineCheckpoints.push({ stage, stageIndex, checkpoint });
    }
  }

  if (pipelineCheckpoints.length === 0) {
    return { kind: "run", stage: firstStage };
  }

  const latest = pipelineCheckpoints.reduce((current, candidate) => {
    if (candidate.stageIndex !== current.stageIndex) {
      return candidate.stageIndex > current.stageIndex ? candidate : current;
    }

    return checkpointTime(candidate.checkpoint) > checkpointTime(current.checkpoint) ? candidate : current;
  });

  switch (latest.checkpoint.status) {
    case "completed": {
      const nextStage = pipeline.stages[latest.stageIndex + 1];
      return nextStage ? { kind: "run", stage: nextStage } : { kind: "done" };
    }
    case "awaiting_human":
      return { kind: "awaiting_human", stage: latest.stage };
    case "failed":
      return { kind: "failed", stage: latest.stage };
    case "in_progress":
      return { kind: "crashed", stage: latest.stage };
  }
}

function checkpointTime(checkpoint: Checkpoint): number {
  const time = Date.parse(checkpoint.timestamp);
  return Number.isNaN(time) ? 0 : time;
}
