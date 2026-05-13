import type { Command } from "commander";
import { FinalReviewSchema } from "../../artifacts/final-review.js";
import { getNextStage, readCheckpoint, updateState, writeCheckpoint } from "../../checkpoints/index.js";
import { recordDecision } from "../../decisions/store.js";
import { buildForceApprovalDecision } from "../../review/final-review.js";
import type { CliIo, GlobalOptions } from "./stub.js";
import { loadRunTarget } from "./run-target.js";

type ApproveEvent = {
  event: "stage_approved" | "stage_force_approved";
  command: "approve";
  target: string;
  show: string;
  episode: string;
  stage: string;
};

type ForceApproveEvent = ApproveEvent & {
  event: "stage_force_approved";
  decision_id: string;
};

type ApproveOptions = GlobalOptions & {
  force?: string;
};

export function createApproveHandler(io: CliIo) {
  return async (target: string, ...actionArgs: unknown[]): Promise<void> => {
    const command = actionArgs.at(-1) as Command;
    const options = command.optsWithGlobals<ApproveOptions>();
    const loaded = await loadRunTarget(target);
    const next = await getNextStage(loaded.projectRoot, loaded.showSlug, loaded.episodeSlug, loaded.pipeline);

    if (options.force !== undefined) {
      await forceApproveFailedFinalReview(target, loaded, next, options.force, options, io);
      return;
    }

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

async function forceApproveFailedFinalReview(
  target: string,
  loaded: Awaited<ReturnType<typeof loadRunTarget>>,
  next: Awaited<ReturnType<typeof getNextStage>>,
  reason: string,
  options: ApproveOptions,
  io: CliIo,
): Promise<void> {
  const trimmedReason = reason.trim();
  if (trimmedReason.length === 0) {
    throw new Error("--force requires a non-empty approval reason");
  }

  if (next.kind !== "failed") {
    throw new Error(`--force requires a failed final_review checkpoint for ${target}`);
  }

  const checkpoint = await readCheckpoint(loaded.projectRoot, loaded.showSlug, loaded.episodeSlug, next.stage.slug);
  const finalReview = finalReviewFromArtifact(checkpoint.artifact);
  if (finalReview?.status !== "fail") {
    throw new Error(`--force requires checkpoint artifact final_review.status === "fail" for ${target}`);
  }

  const timestamp = new Date().toISOString();
  const decision = buildForceApprovalDecision({
    timestamp,
    reason: trimmedReason,
    stage: next.stage.slug,
  });
  await recordDecision(`${loaded.showSlug}/${loaded.episodeSlug}`, decision, { root: loaded.projectRoot });
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
    const event: ForceApproveEvent = {
      event: "stage_force_approved",
      command: "approve",
      target,
      show: loaded.showSlug,
      episode: loaded.episodeSlug,
      stage: next.stage.slug,
      decision_id: decision.id,
    };
    io.stdout.write(`${JSON.stringify(event)}\n`);
    return;
  }

  io.stdout.write(`approve: ${next.stage.slug} force-approved (${decision.id})\n`);
}

function finalReviewFromArtifact(artifact: unknown): { status: "pass" | "revise" | "fail" } | undefined {
  const direct = FinalReviewSchema.safeParse(artifact);
  if (direct.success) {
    return direct.data;
  }

  if (typeof artifact !== "object" || artifact === null || Array.isArray(artifact) || !("final_review" in artifact)) {
    return undefined;
  }

  const nested = FinalReviewSchema.safeParse((artifact as { final_review?: unknown }).final_review);
  return nested.success ? nested.data : undefined;
}
