import { existsSync } from "node:fs";
import path from "node:path";
import {
  AbortedByUser,
  AwaitingHuman,
  announceCapabilityExtension,
  buildCapabilityExtensionDecision,
} from "../announce/index.js";
import type { CostEntry, CostLog } from "../artifacts/cost-log.js";
import { EditDecisionsSchema } from "../artifacts/edit-decisions.js";
import { FinalReviewSchema, type FinalReview } from "../artifacts/final-review.js";
import type { DecisionEntry, DecisionLog } from "../artifacts/decision-log.js";
import { ProposalPacketSchema } from "../artifacts/proposal-packet.js";
import { RenderReportSchema } from "../artifacts/render-report.js";
import { ReviewSchema, type Review } from "../artifacts/review.js";
import type { VideoAnalysisBrief } from "../artifacts/video-analysis-brief.js";
import {
  latestSampleVersion,
  listCheckpoints,
  readCheckpoint,
  readState,
  updateState,
  atomicWrite,
  writeCheckpoint,
  writeSampleCheckpoint,
  type Checkpoint,
  type CheckpointStatus,
  type PipelineState,
} from "../checkpoints/index.js";
import type { CliIo } from "../cli/commands/stub.js";
import { projectDir } from "../checkpoints/paths.js";
import { readCostLog, recordCost } from "../cost/tracker.js";
import { currentDecisions, readDecisionLog, recordDecision } from "../decisions/store.js";
import type { PipelineManifest, Stage } from "../pipelines/index.js";
import type { Registry } from "../registry/index.js";
import type { Availability, Tool, ToolExecutionPolicy, ToolExecutionState, ToolInteractionIO } from "../registry/tool.js";
import { runReview, type ReviewContext } from "../review/runner.js";
import { haltOnFinalReviewFail } from "../review/final-review.js";
import { hasSampleFirstSkipApproval, isSampleFirstFinding } from "../review/sample-first.js";
import { PlaybookSchema } from "../shows/playbook.js";
import type { LoadedEpisode, LoadedShow } from "../shows/index.js";
import { writeApprovalBlock, type ApprovalAction, type ApprovalContext } from "./approval.js";
import { createStageContext, loadPriorArtifacts, type StageRunOptions } from "./context.js";
import type { Dispatcher } from "./dispatcher.js";
import type { StageResult } from "./result.js";
import { planStages } from "./plan.js";
import { loadCapabilityExtensions, type CapabilityExtension, type CapabilityExtensions } from "./capability-extension.js";

export type RunnerStatus =
  | "completed"
  | "awaiting_human"
  | "failed"
  | "aborted"
  | "budget_exceeded"
  | "limits_exceeded";

export type RegistryWarning = {
  tool: string;
  reason: string;
  fix?: string;
};

export type StageReviewer = (stageSlug: string, artifact: unknown, ctx: ReviewContext) => Review | Promise<Review>;

export type ApprovalPromptResult = ApprovalAction | { action: ApprovalAction; note?: string };

export type RunnerOptions = {
  projectRoot: string;
  show: LoadedShow;
  episode: LoadedEpisode;
  pipeline: PipelineManifest;
  pipelineName: string;
  playbook?: unknown;
  registry: Registry;
  dispatcher: Dispatcher;
  reviewer?: StageReviewer;
  runOptions: StageRunOptions;
  io: CliIo;
  json?: boolean;
  now?: () => Date;
  cuesheet?: unknown;
  videoAnalysisBrief?: VideoAnalysisBrief;
  prompt?: (checkpoint: Checkpoint, approvalCtx: ApprovalContext) => Promise<ApprovalPromptResult>;
};

export type RunnerResult = {
  status: RunnerStatus;
  lastStage?: string;
  totalCostUsd: number;
  decisions: DecisionEntry[];
  warnings: RegistryWarning[];
};

type CheckpointStatusMap = Map<string, CheckpointStatus>;

type StageExecutionOutcome =
  | { kind: "continue"; stage: string; totalCostUsd: number; decisions: DecisionEntry[]; artifact: unknown; sendBacks: number }
  | { kind: "rerun"; stage: string; totalCostUsd: number; decisions: DecisionEntry[]; sendBacks: number }
  | { kind: "halt"; result: RunnerResult };

type ExistingApprovalOutcome =
  | { kind: "continue"; artifact: unknown }
  | { kind: "rerun" }
  | { kind: "halt"; result: RunnerResult };

const ZERO_COST = {
  stage_cost_usd: 0,
  total_so_far_usd: 0,
  budget_remaining_usd: 0,
};

export class Runner {
  static async run(opts: RunnerOptions): Promise<RunnerResult> {
    const now = opts.now ?? (() => new Date());
    const reviewer = opts.reviewer ?? runReview;
    const extensions = await loadCapabilityExtensions({
      projectRoot: opts.projectRoot,
      show: opts.show,
      episode: opts.episode,
    });
    await opts.registry.registerProjectTools(opts.projectRoot, opts.show, opts.episode);
    const warnings = await refreshRegistryAndWarn(opts);
    const state = await readState(opts.projectRoot, opts.show.slug, opts.episode.slug);
    const revisionNotes = cloneRevisionNotes(state?.revision_notes);
    const completedStages = await completedStageSlugs(opts);
    const checkpointStatuses = await checkpointStatusMap(opts);
    let priorArtifacts = await loadPriorArtifacts(opts.projectRoot, opts.show, opts.episode, opts.pipeline);
    if (opts.videoAnalysisBrief !== undefined) {
      priorArtifacts = { ...priorArtifacts, video_analysis_brief: opts.videoAnalysisBrief };
    }
    let plannedStages = planStages(opts.pipeline, opts.runOptions, { completedStages });
    let cumulativeCost = state?.cost_total_usd ?? 0;
    const budget = resolveBudget(opts);
    const decisions = await recordLoadedCapabilityExtensions(opts, extensions, now);
    const firstPaidApprovals = new Set<string>();
    let sendBacks = 0;
    let lastStage: string | undefined;
    const startMs = now().getTime();

    if (shouldResume(opts.runOptions)) {
      plannedStages = plannedStages.filter((stage) => checkpointStatuses.get(stage.slug) !== "completed");
    }

    for (let index = 0; index < plannedStages.length; ) {
      const stage = plannedStages[index];
      if (stage === undefined) {
        break;
      }

      lastStage = stage.slug;
      const existingStatus = checkpointStatuses.get(stage.slug);
      const queuedRevision = queuedRevisionForStage(state, stage.slug);

      if (existingStatus === "awaiting_human" && shouldResume(opts.runOptions) && queuedRevision === undefined) {
        const checkpoint = await readCheckpoint(opts.projectRoot, opts.show.slug, opts.episode.slug, stage.slug);
        const gate = await handleApprovalGate({
          opts,
          checkpoint,
          approvalCtx: buildApprovalContext(checkpoint, budget, plannedStages[index + 1], plannedStages.slice(index + 1)),
          revisionNotes,
          cumulativeCost,
          decisions,
          warnings,
          sendBacks,
          now,
        });
        sendBacks = gate.sendBacks;

        if (gate.outcome.kind === "halt") {
          return gate.outcome.result;
        }
        if (gate.outcome.kind === "rerun") {
          await clearQueuedRevision(opts);
        } else {
          priorArtifacts = { ...priorArtifacts, [stage.slug]: gate.outcome.artifact };
          checkpointStatuses.set(stage.slug, "completed");
          index += 1;
          continue;
        }
      }

      if (existingStatus === "failed" && shouldResume(opts.runOptions) && queuedRevision === undefined) {
        return {
          status: "failed",
          lastStage: stage.slug,
          totalCostUsd: cumulativeCost,
          decisions,
          warnings,
        };
      }

      const sampleLimit = sampleLimitExceeded(opts, stage, priorArtifacts, cumulativeCost, budget);
      if (sampleLimit !== undefined) {
        await writeSampleLimitCheckpoint({
          opts,
          stage,
          reason: sampleLimit.reason,
          totalCostUsd: cumulativeCost,
          budget,
          revisionNotes,
          now,
        });
        emitSampleLimit(opts, sampleLimit);
        return {
          status: sampleLimit.status,
          lastStage: stage.slug,
          totalCostUsd: cumulativeCost,
          decisions,
          warnings,
        };
      }

      const outcome = await runStage({
        opts,
        stage,
        nextStage: plannedStages[index + 1],
        remainingStages: plannedStages.slice(index + 1),
        priorArtifacts,
        revisionNotes,
        cumulativeCost,
        budget,
        reviewer,
        decisions,
        warnings,
        sendBacks,
        firstPaidApprovals,
        startMs,
        now,
      });

      if (outcome.kind === "halt") {
        return outcome.result;
      }

      sendBacks = outcome.sendBacks;
      cumulativeCost = outcome.totalCostUsd;
      decisions.push(...outcome.decisions);
      await clearQueuedRevision(opts);

      if (outcome.kind === "rerun") {
        continue;
      }

      priorArtifacts = { ...priorArtifacts, [stage.slug]: outcome.artifact };
      checkpointStatuses.set(stage.slug, "completed");
      index += 1;
    }

    return {
      status: "completed",
      lastStage,
      totalCostUsd: cumulativeCost,
      decisions,
      warnings,
    };
  }
}

async function refreshRegistryAndWarn(opts: RunnerOptions): Promise<RegistryWarning[]> {
  await opts.registry.refreshAvailability({ context: { projectRoot: opts.projectRoot } });

  const warnings = opts.registry.all().flatMap((tool) => {
    const availability = opts.registry.getAvailability(tool.name);
    return availability?.available === false ? [registryWarning(tool.name, availability)] : [];
  });

  if (warnings.length === 0) {
    return [];
  }

  if (shouldSuppressRegistryWarnings(opts)) {
    return [];
  }

  if (opts.json === true) {
    opts.io.stdout.write(`${JSON.stringify({ event: "registry_warnings", warnings })}\n`);
    return warnings;
  }

  opts.io.stdout.write(
    [
      "Registry warnings:",
      ...warnings.map((warning) => {
        const fix = warning.fix ? ` (${warning.fix})` : "";
        return `- ${warning.tool}: ${warning.reason}${fix}`;
      }),
      "",
    ].join("\n"),
  );
  return warnings;
}

function shouldSuppressRegistryWarnings(opts: RunnerOptions): boolean {
  return opts.runOptions.sample === true && usesZeroKeyStarterSample(opts.pipeline);
}

function usesZeroKeyStarterSample(pipeline: PipelineManifest): boolean {
  const metadata = pipeline.metadata;
  return (
    typeof metadata === "object" &&
    metadata !== null &&
    !Array.isArray(metadata) &&
    metadata.starter_sample_dispatcher === "zero-key"
  );
}

function registryWarning(tool: string, availability: Extract<Availability, { available: false }>): RegistryWarning {
  return {
    tool,
    reason: availability.reason,
    fix: availability.fix,
  };
}

async function recordLoadedCapabilityExtensions(
  opts: RunnerOptions,
  extensions: CapabilityExtensions,
  now: () => Date,
): Promise<DecisionEntry[]> {
  const existing = await readDecisionLog({ show: opts.show.slug, episode: opts.episode.slug }, { root: opts.projectRoot });
  const alreadyLogged = new Set(existing.filter((entry) => entry.category === "capability_extension").map((entry) => entry.picked));
  const activePlaybook = opts.episode.playbook ?? opts.show.pipelines[opts.pipelineName]?.playbook;
  const entries: DecisionEntry[] = [];

  for (const extension of extensions.all.filter((candidate) => shouldLogLoadedExtension(candidate, activePlaybook))) {
    const picked = `${extension.kind}:${extension.name}`;
    if (alreadyLogged.has(picked)) {
      continue;
    }

    const entry = buildCapabilityExtensionDecision({
      kind: extension.kind,
      name: extension.name,
      why: extensionWhy(opts, extension),
      path: path.relative(opts.projectRoot, extension.path),
      timestamp: now().toISOString(),
      id: `capability-extension-${extension.kind}-${safeDecisionSegment(extension.name)}`,
    });
    await recordDecision({ show: opts.show.slug, episode: opts.episode.slug }, entry, { root: opts.projectRoot });
    alreadyLogged.add(picked);
    entries.push(entry);
  }

  return entries;
}

function shouldLogLoadedExtension(extension: CapabilityExtension, activePlaybook: string | undefined): boolean {
  if (extension.kind === "tool" && extension.isPaid) {
    return false;
  }

  if (extension.kind !== "playbook") {
    return true;
  }

  return activePlaybook !== undefined && playbookNamesMatch(extension.name, activePlaybook);
}

function playbookNamesMatch(extensionName: string, playbookName: string): boolean {
  const normalized = playbookName.replace(/\.(ya?ml)$/iu, "");
  return extensionName === normalized;
}

function extensionWhy(opts: RunnerOptions, extension: CapabilityExtension): { x: string; y: string } {
  switch (extension.kind) {
    case "script":
      return {
        x: `${opts.show.slug}/${opts.episode.slug}`,
        y: `${extension.name} script workflow`,
      };
    case "tool":
      return {
        x: `${opts.show.slug}/${opts.episode.slug}`,
        y: `${extension.name} tool capability`,
      };
    case "playbook":
      return {
        x: `${opts.pipelineName} look`,
        y: `${extension.name} custom style rules`,
      };
    case "skill":
      return {
        x: opts.show.slug,
        y: `${extension.name} show-specific instructions`,
      };
  }
}

function safeDecisionSegment(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

async function runStage(input: {
  opts: RunnerOptions;
  stage: Stage;
  nextStage?: Stage;
  remainingStages: Stage[];
  priorArtifacts: Record<string, unknown>;
  revisionNotes: Record<string, string[]>;
  cumulativeCost: number;
  budget: number;
  reviewer: StageReviewer;
  decisions: DecisionEntry[];
  warnings: RegistryWarning[];
  sendBacks: number;
  firstPaidApprovals: Set<string>;
  startMs: number;
  now: () => Date;
}): Promise<StageExecutionOutcome> {
  const { opts, stage, now } = input;
  let round = 0;
  let stageCostUsd = 0;
  let sendBacks = input.sendBacks;
  const priorReviews: Review[] = [];
  const toolPolicyDecisions: DecisionEntry[] = [];

  await writeInProgressCheckpoint(opts, stage, input.revisionNotes, now);

  while (true) {
    const costLog = await readCostLog(opts.projectRoot, opts.show.slug, opts.episode.slug);
    const decisionLog = await readDecisionLog({ show: opts.show.slug, episode: opts.episode.slug }, { root: opts.projectRoot });
    const ctx = createStageContext({
      show: opts.show,
      episode: opts.episode,
      pipeline: opts.pipeline,
      stage,
      playbook: opts.playbook,
      priorArtifacts: input.priorArtifacts,
      registry: opts.registry,
      cuesheet: opts.cuesheet,
      runOptions: opts.runOptions,
      toolPolicy: buildToolPolicy({
        opts,
        stage,
        costLog,
        decisionLog,
        budget: input.budget,
        cumulativeCost: roundUsd(input.cumulativeCost + stageCostUsd),
        priorArtifacts: input.priorArtifacts,
        decisions: toolPolicyDecisions,
        firstPaidApprovals: input.firstPaidApprovals,
        now,
      }),
      revisionNotes: input.revisionNotes[stage.slug] ?? [],
    });

    let result: StageResult;
    let review: Review;

    try {
      result = await opts.dispatcher(ctx);
      stageCostUsd = roundUsd(stageCostUsd + result.cost_used.stage_cost_usd);
      await recordStageCosts(opts, result);
      review = await runStageReview(opts, input.reviewer, stage, result, round, priorReviews, {
        cumulativeActualUsd: roundUsd(input.cumulativeCost + stageCostUsd),
        cumulativeEstimatedUsd: cumulativeEstimatedCost(opts.pipeline, stage.slug, opts.runOptions),
        costLog,
        priorArtifacts: input.priorArtifacts,
      });
    } catch (error) {
      if (error instanceof AwaitingHuman) {
        return {
          kind: "halt",
          result: {
            status: "awaiting_human",
            lastStage: stage.slug,
            totalCostUsd: roundUsd(input.cumulativeCost + stageCostUsd),
            decisions: [...input.decisions, ...toolPolicyDecisions],
            warnings: input.warnings,
          },
        };
      }

      if (error instanceof AbortedByUser) {
        return {
          kind: "halt",
          result: {
            status: "aborted",
            lastStage: stage.slug,
            totalCostUsd: roundUsd(input.cumulativeCost + stageCostUsd),
            decisions: [...input.decisions, ...toolPolicyDecisions],
            warnings: input.warnings,
          },
        };
      }

      const failure = failureDetails(error);
      const totalCostUsd = roundUsd(input.cumulativeCost + stageCostUsd + failure.costEntries.reduce((sum, entry) => sum + entry.usd, 0));
      await recordFailureCosts(opts, failure.costEntries);
      await writeFailedErrorCheckpoint({
        opts,
        stage,
        artifact: failureArtifact(failure),
        totalCostUsd,
        budget: input.budget,
        toolInvocations: failure.costEntries,
        revisionNotes: input.revisionNotes,
        skillsRead: ctx.skills_read,
        playbook: opts.playbook,
        now,
      });
      return {
        kind: "halt",
        result: {
          status: "failed",
          lastStage: stage.slug,
          totalCostUsd,
          decisions: [...input.decisions, ...toolPolicyDecisions],
          warnings: input.warnings,
        },
      };
    }

    priorReviews.push(review);

    const finalReview = finalReviewFromStageResult(stage, result);
    if (finalReview?.status === "fail") {
      const totalCostUsd = roundUsd(input.cumulativeCost + stageCostUsd);
      const stageDecisions = [...toolPolicyDecisions, ...(await recordStageDecisions(opts, result.decisions))];
      const preservedPath = preserveFailedRender(opts, result, finalReview);
      const checkpoint = checkpointForStage({
        stage,
        status: "failed",
        artifact: result.artifact,
        review,
        stageCostUsd,
        totalCostUsd,
        budget: input.budget,
        skillsRead: ctx.skills_read,
        playbook: opts.playbook,
        toolInvocations: result.cost_entries ?? [],
        now,
      });
      await writeCompletedCheckpointAndState(opts, checkpoint, totalCostUsd, input.revisionNotes);
      emitFinalReviewFailed(opts, stage.slug, preservedPath);
      return {
        kind: "halt",
        result: {
          status: "failed",
          lastStage: stage.slug,
          totalCostUsd,
          decisions: [...input.decisions, ...stageDecisions],
          warnings: input.warnings,
        },
      };
    }

    if (review.decision === "revise") {
      const sampleFirstOutcome = await handleSampleFirstReview({
        opts,
        stage,
        nextStage: input.nextStage,
        remainingStages: input.remainingStages,
        result,
        review,
        stageCostUsd,
        cumulativeCost: input.cumulativeCost,
        budget: input.budget,
        skillsRead: ctx.skills_read,
        playbook: opts.playbook,
        toolInvocations: result.cost_entries ?? [],
        revisionNotes: input.revisionNotes,
        decisions: input.decisions,
        toolPolicyDecisions,
        warnings: input.warnings,
        sendBacks,
        now,
      });

      if (sampleFirstOutcome !== undefined) {
        return sampleFirstOutcome;
      }

      if (round >= opts.pipeline.orchestration.max_revisions_per_stage) {
        const totalCostUsd = roundUsd(input.cumulativeCost + stageCostUsd);
        const checkpoint = checkpointForStage({
          stage,
          status: "failed",
          artifact: result.artifact,
          review,
          stageCostUsd,
          totalCostUsd,
          budget: input.budget,
          skillsRead: ctx.skills_read,
          playbook: opts.playbook,
          toolInvocations: result.cost_entries ?? [],
          now,
        });
        await writeCompletedCheckpointAndState(opts, checkpoint, totalCostUsd, input.revisionNotes);
        return {
          kind: "halt",
          result: {
            status: "failed",
            lastStage: stage.slug,
            totalCostUsd,
            decisions: [...input.decisions, ...toolPolicyDecisions],
            warnings: input.warnings,
          },
        };
      }

      appendRevisionNote(input.revisionNotes, stage.slug, reviewRevisionNote(review));
      sendBacks += 1;
      if (sendBacks > opts.pipeline.orchestration.max_send_backs) {
        const totalCostUsd = roundUsd(input.cumulativeCost + stageCostUsd);
        const checkpoint = checkpointForStage({
          stage,
          status: "failed",
          artifact: result.artifact,
          review,
          stageCostUsd,
          totalCostUsd,
          budget: input.budget,
          skillsRead: ctx.skills_read,
          playbook: opts.playbook,
          toolInvocations: result.cost_entries ?? [],
          now,
        });
        await writeCompletedCheckpointAndState(opts, checkpoint, totalCostUsd, input.revisionNotes);
        return limitsExceeded(opts, stage.slug, totalCostUsd, [...input.decisions, ...toolPolicyDecisions], input.warnings);
      }

      round += 1;
      continue;
    }

    const totalCostUsd = roundUsd(input.cumulativeCost + stageCostUsd);
    const overBudget = totalCostUsd > input.budget;
    const status = checkpointStatusForStage(opts, stage, overBudget);
    const checkpoint = checkpointForStage({
      stage,
      status,
      artifact: result.artifact,
      review,
      stageCostUsd,
      totalCostUsd,
      budget: input.budget,
      skillsRead: ctx.skills_read,
      playbook: opts.playbook,
      toolInvocations: result.cost_entries ?? [],
      now,
    });
    const stageDecisions = [...toolPolicyDecisions, ...(await recordStageDecisions(opts, result.decisions))];

    await writeCompletedCheckpointAndState(opts, checkpoint, totalCostUsd, input.revisionNotes);

    if (overBudget) {
      emitBudgetWarning(opts, totalCostUsd, input.budget);
      return {
        kind: "halt",
        result: {
          status: "budget_exceeded",
          lastStage: stage.slug,
          totalCostUsd,
          decisions: [...input.decisions, ...stageDecisions],
          warnings: input.warnings,
        },
      };
    }

    if (wallTimeExceeded(opts.pipeline, input.startMs, now)) {
      return limitsExceeded(opts, stage.slug, totalCostUsd, [...input.decisions, ...stageDecisions], input.warnings);
    }

    if (checkpoint.status === "awaiting_human") {
      const gate = await handleApprovalGate({
        opts,
        checkpoint,
        approvalCtx: buildApprovalContext(checkpoint, input.budget, input.nextStage, input.remainingStages),
        revisionNotes: input.revisionNotes,
        cumulativeCost: totalCostUsd,
        decisions: [...input.decisions, ...stageDecisions],
        warnings: input.warnings,
        sendBacks,
        now,
      });
      sendBacks = gate.sendBacks;

      if (gate.outcome.kind === "halt") {
        return gate.outcome;
      }
      if (gate.outcome.kind === "rerun") {
        return {
          kind: "rerun",
          stage: stage.slug,
          totalCostUsd,
          decisions: stageDecisions,
          sendBacks,
        };
      }
    }

    return {
      kind: "continue",
      stage: stage.slug,
      totalCostUsd,
      decisions: stageDecisions,
      artifact: result.artifact,
      sendBacks,
    };
  }
}

async function handleSampleFirstReview(input: {
  opts: RunnerOptions;
  stage: Stage;
  nextStage?: Stage;
  remainingStages: Stage[];
  result: StageResult;
  review: Review;
  stageCostUsd: number;
  cumulativeCost: number;
  budget: number;
  skillsRead: string[];
  playbook: unknown;
  toolInvocations: Checkpoint["tool_invocations"];
  revisionNotes: Record<string, string[]>;
  decisions: DecisionEntry[];
  toolPolicyDecisions: DecisionEntry[];
  warnings: RegistryWarning[];
  sendBacks: number;
  now: () => Date;
}): Promise<StageExecutionOutcome | undefined> {
  const { opts, stage, review, result, now } = input;

  if (!isProposalStageSlug(stage.slug)) {
    return undefined;
  }

  const proposal = ProposalPacketSchema.safeParse(result.artifact);
  if (!proposal.success || proposal.data.production_plan.sample_required === true) {
    return undefined;
  }

  const criticalFindings = review.findings.filter((finding) => finding.severity === "critical");
  if (
    criticalFindings.length === 0 ||
    !criticalFindings.some(isSampleFirstFinding) ||
    !criticalFindings.every(isSampleFirstFinding)
  ) {
    return undefined;
  }

  const existingDecisionLog = await readDecisionLog({ show: opts.show.slug, episode: opts.episode.slug }, { root: opts.projectRoot });
  if (hasSampleFirstSkipApproval([...existingDecisionLog, ...result.decisions])) {
    return undefined;
  }

  const totalCostUsd = roundUsd(input.cumulativeCost + input.stageCostUsd);
  const checkpoint = checkpointForStage({
    stage,
    status: "awaiting_human",
    artifact: result.artifact,
    review,
    stageCostUsd: input.stageCostUsd,
    totalCostUsd,
    budget: input.budget,
    skillsRead: input.skillsRead,
    playbook: input.playbook,
    toolInvocations: input.toolInvocations,
    now,
  });
  const approvalCtx: ApprovalContext = {
    ...buildApprovalContext(checkpoint, input.budget, input.nextStage, input.remainingStages),
    kind: "sample-first",
    actions: ["sample", "downgrade", "abort"],
  };

  writeApprovalBlock(opts.io, checkpoint, approvalCtx, { json: opts.json === true });

  if (opts.runOptions.nonInteractive === true || opts.prompt === undefined) {
    await writeSampleFirstAwaitingState({
      opts,
      checkpoint,
      totalCostUsd,
      revisionNotes: input.revisionNotes,
    });
    return {
      kind: "halt",
      result: {
        status: "awaiting_human",
        lastStage: stage.slug,
        totalCostUsd,
        decisions: [...input.decisions, ...input.toolPolicyDecisions],
        warnings: input.warnings,
      },
    };
  }

  const action = normalizeApprovalPromptResult(await opts.prompt(checkpoint, approvalCtx));
  if (action.action === "abort") {
    return {
      kind: "halt",
      result: {
        status: "aborted",
        lastStage: stage.slug,
        totalCostUsd,
        decisions: [...input.decisions, ...input.toolPolicyDecisions],
        warnings: input.warnings,
      },
    };
  }

  if (action.action === "sample") {
    await writeSampleFirstAwaitingState({
      opts,
      checkpoint,
      totalCostUsd,
      revisionNotes: input.revisionNotes,
    });
    return {
      kind: "halt",
      result: {
        status: "awaiting_human",
        lastStage: stage.slug,
        totalCostUsd,
        decisions: [...input.decisions, ...input.toolPolicyDecisions],
        warnings: input.warnings,
      },
    };
  }

  if (action.action !== "downgrade") {
    throw new Error(`sample-first prompt expected sample, downgrade, or abort; received ${action.action}`);
  }

  const downgradeDecision = buildSampleFirstDowngradeDecision({
    stage: stage.slug,
    timestamp: now().toISOString(),
    note: action.note,
  });
  await recordDecision({ show: opts.show.slug, episode: opts.episode.slug }, downgradeDecision, { root: opts.projectRoot });
  const acceptedReview = reviewWithoutSampleFirstCriticals(review);
  const completedCheckpoint = checkpointForStage({
    stage,
    status: "completed",
    artifact: result.artifact,
    review: acceptedReview,
    stageCostUsd: input.stageCostUsd,
    totalCostUsd,
    budget: input.budget,
    skillsRead: input.skillsRead,
    playbook: input.playbook,
    toolInvocations: input.toolInvocations,
    now,
  });
  const stageDecisions = [
    ...input.toolPolicyDecisions,
    ...(await recordStageDecisions(opts, result.decisions)),
    downgradeDecision,
  ];

  await writeCompletedCheckpointAndState(opts, completedCheckpoint, totalCostUsd, input.revisionNotes);

  return {
    kind: "continue",
    stage: stage.slug,
    totalCostUsd,
    decisions: stageDecisions,
    artifact: result.artifact,
    sendBacks: input.sendBacks,
  };
}

async function writeSampleFirstAwaitingState(input: {
  opts: RunnerOptions;
  checkpoint: Checkpoint;
  totalCostUsd: number;
  revisionNotes: Record<string, string[]>;
}): Promise<void> {
  const { opts } = input;
  const state = await readState(opts.projectRoot, opts.show.slug, opts.episode.slug);
  const version = latestSampleVersion(state) + 1;
  const projected = sampleFirstCostProjection(opts.pipeline, input.totalCostUsd);

  await writeSampleCheckpoint(opts.projectRoot, opts.show.slug, opts.episode.slug, version, {
    cost_for_this_sample: projected.sample,
    cumulative_sample_cost: projected.sample,
    projected_full_cost: projected.full,
    sample_video_path: "pending",
  });
  await writeCompletedCheckpointAndState(opts, input.checkpoint, input.totalCostUsd, input.revisionNotes);
}

function sampleFirstCostProjection(pipeline: PipelineManifest, fallbackFullCost: number): { sample: number; full: number } {
  const sample = totalEstimatedCost(pipeline, true) ?? 0;
  const full = totalEstimatedCost(pipeline, false) ?? fallbackFullCost;

  return {
    sample: roundUsd(sample),
    full: roundUsd(full),
  };
}

function buildSampleFirstDowngradeDecision(input: {
  stage: string;
  timestamp: string;
  note?: string;
}): DecisionEntry {
  const suffix = input.timestamp.replace(/[^0-9A-Z]/gu, "");
  const note = input.note?.trim();
  const reason =
    note && note.length > 0
      ? `User approved a sample-first skip after prompt: ${note}`
      : "User approved a sample-first skip after prompt and accepted proceeding at full cost.";

  return {
    id: `sample-first-downgrade-${suffix}`,
    stage: input.stage,
    timestamp: input.timestamp,
    category: "downgrade_approval",
    options_considered: [
      {
        label: "produce_sample_first",
        rejected_because: "User chose to skip the representative sample checkpoint.",
        notes: "Recommended path for expensive, slow, reference-driven, or motion-sensitive work.",
      },
      {
        label: "skip_sample_first",
        rejected_because: null,
        notes: "Proceed at full cost with an audited downgrade approval.",
      },
    ],
    picked: "skip_sample_first",
    reason,
    confidence: 0.7,
    user_visible: true,
    supersedes: null,
  };
}

function reviewWithoutSampleFirstCriticals(review: Review): Review {
  const findings = review.findings.filter((finding) => !isSampleFirstFinding(finding)) as Review["findings"];

  return ReviewSchema.parse({
    ...review,
    decision: "pass",
    findings,
    summary: {
      ...review.summary,
      critical: findings.filter((finding) => finding.severity === "critical").length,
      suggestions: findings.filter((finding) => finding.severity === "suggestion").length,
      nitpicks: findings.filter((finding) => finding.severity === "nitpick").length,
      investigations: findings.filter((finding) => finding.severity === "investigation").length,
    },
  });
}

async function runStageReview(
  opts: RunnerOptions,
  reviewer: StageReviewer,
  stage: Stage,
  result: StageResult,
  round: number,
  priorReviews: Review[],
  cumulative: {
    cumulativeActualUsd: number;
    cumulativeEstimatedUsd: number;
    costLog?: CostLog;
    priorArtifacts: Record<string, unknown>;
  },
): Promise<Review> {
  const existingDecisionLog = await readDecisionLog({ show: opts.show.slug, episode: opts.episode.slug }, { root: opts.projectRoot });
  const decisionLog: DecisionLog = [...existingDecisionLog, ...result.decisions];
  const artifactContext = artifactReviewContext(stage, result, cumulative.priorArtifacts);
  const review = await reviewer(stage.slug, result.artifact, {
    pipeline: opts.pipeline,
    round,
    priorReviews,
    decisionLog,
    cuesheet: opts.cuesheet,
    audioLed: opts.pipeline.master_clock !== undefined && opts.pipeline.master_clock !== "none",
    pipelineSlug: opts.pipeline.slug,
    estimatedCostUsd: estimatedCostForReview(opts.pipeline, stage, opts.runOptions),
    cumulativeEstimatedUsd: cumulative.cumulativeEstimatedUsd,
    cumulativeActualUsd: cumulative.cumulativeActualUsd,
    costDriftThreshold: opts.runOptions.cost_drift_threshold ?? opts.pipeline.orchestration.cost_drift_threshold,
    costLog: cumulative.costLog,
    referenceBrief: opts.videoAnalysisBrief,
    videoAnalysisBrief: opts.videoAnalysisBrief,
    referenceDriven: opts.videoAnalysisBrief !== undefined,
    show: opts.show.slug,
    episode: opts.episode.slug,
    projectRoot: opts.projectRoot,
    playbook: reviewPlaybook(opts.playbook),
    ...artifactContext,
  });

  return ReviewSchema.parse(review);
}

function artifactReviewContext(
  stage: Stage,
  result: StageResult,
  priorArtifacts: Record<string, unknown>,
): Pick<ReviewContext, "proposalPacket" | "editDecisions" | "renderReport" | "finalReviewArtifact"> {
  return {
    proposalPacket: parsedProposalPacket(priorArtifacts.proposal ?? priorArtifacts.proposal_packet),
    editDecisions: parsedEditDecisions(priorArtifacts.edit ?? priorArtifacts.edit_decisions),
    renderReport: parsedRenderReport(result.artifact),
    finalReviewArtifact: finalReviewFromStageResult(stage, result),
  };
}

function parsedProposalPacket(value: unknown): ReviewContext["proposalPacket"] {
  const parsed = ProposalPacketSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parsedEditDecisions(value: unknown): ReviewContext["editDecisions"] {
  const parsed = EditDecisionsSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

function parsedRenderReport(value: unknown): ReviewContext["renderReport"] {
  const parsed = RenderReportSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

async function handleApprovalGate(input: {
  opts: RunnerOptions;
  checkpoint: Checkpoint;
  approvalCtx: ApprovalContext;
  revisionNotes: Record<string, string[]>;
  cumulativeCost: number;
  decisions: DecisionEntry[];
  warnings: RegistryWarning[];
  sendBacks: number;
  now: () => Date;
}): Promise<{ outcome: ExistingApprovalOutcome; sendBacks: number }> {
  writeApprovalBlock(input.opts.io, input.checkpoint, input.approvalCtx, { json: input.opts.json === true });

  if (input.opts.runOptions.nonInteractive === true || input.opts.prompt === undefined) {
    return {
      sendBacks: input.sendBacks,
      outcome: {
        kind: "halt",
        result: {
          status: "awaiting_human",
          lastStage: input.checkpoint.stage,
          totalCostUsd: input.cumulativeCost,
          decisions: input.decisions,
          warnings: input.warnings,
        },
      },
    };
  }

  const action = normalizeApprovalPromptResult(await input.opts.prompt(input.checkpoint, input.approvalCtx));
  if (action.action === "abort") {
    return {
      sendBacks: input.sendBacks,
      outcome: {
        kind: "halt",
        result: {
          status: "aborted",
          lastStage: input.checkpoint.stage,
          totalCostUsd: input.cumulativeCost,
          decisions: input.decisions,
          warnings: input.warnings,
        },
      },
    };
  }

  if (action.action === "revise") {
    const sendBacks = input.sendBacks + 1;
    appendRevisionNote(input.revisionNotes, input.checkpoint.stage, action.note ?? "Human requested revision.");
    await updateState(input.opts.projectRoot, input.opts.show.slug, input.opts.episode.slug, {
      pipeline: input.opts.pipelineName,
      current_stage: input.checkpoint.stage,
      last_status: "awaiting_human",
      cost_total_usd: input.cumulativeCost,
      revision_notes: input.revisionNotes,
      queued_stage_revision: undefined,
    });

    if (sendBacks > input.opts.pipeline.orchestration.max_send_backs) {
      return {
        sendBacks,
        outcome: limitsExceeded(input.opts, input.checkpoint.stage, input.cumulativeCost, input.decisions, input.warnings),
      };
    }

    return { sendBacks, outcome: { kind: "rerun" } };
  }

  if (action.action !== "approve") {
    throw new Error(`approval prompt expected approve, revise, or abort; received ${action.action}`);
  }

  const approvedCheckpoint = {
    ...input.checkpoint,
    status: "completed" as const,
    timestamp: input.now().toISOString(),
  };
  await writeCheckpoint(input.opts.projectRoot, input.opts.show.slug, input.opts.episode.slug, input.checkpoint.stage, approvedCheckpoint);
  await updateState(input.opts.projectRoot, input.opts.show.slug, input.opts.episode.slug, {
    pipeline: input.opts.pipelineName,
    current_stage: input.checkpoint.stage,
    last_status: "completed",
    last_checkpoint_at: approvedCheckpoint.timestamp,
    cost_total_usd: input.cumulativeCost,
    revision_notes: input.revisionNotes,
    queued_stage_revision: undefined,
  });

  return {
    sendBacks: input.sendBacks,
    outcome: { kind: "continue", artifact: input.checkpoint.artifact },
  };
}

function limitsExceeded(
  opts: RunnerOptions,
  stage: string,
  totalCostUsd: number,
  decisions: DecisionEntry[],
  warnings: RegistryWarning[],
): { kind: "halt"; result: RunnerResult } {
  return {
    kind: "halt",
    result: {
      status: "limits_exceeded",
      lastStage: stage,
      totalCostUsd,
      decisions,
      warnings,
    },
  };
}

type SampleLimitFailure = {
  status: "budget_exceeded" | "limits_exceeded";
  reason: string;
  limit: number;
  actual: number;
};

function sampleLimitExceeded(
  opts: RunnerOptions,
  stage: Stage,
  priorArtifacts: Record<string, unknown>,
  cumulativeCost: number,
  budget: number,
): SampleLimitFailure | undefined {
  if (opts.runOptions.sample !== true || opts.pipeline.sample === undefined) {
    return undefined;
  }

  const projectedCost = estimatedStageCost(stage, opts.runOptions) ?? 0;
  const maxCost = opts.pipeline.sample.max_cost_usd;
  if (maxCost !== undefined && roundUsd(cumulativeCost + projectedCost) > maxCost) {
    return {
      status: "budget_exceeded",
      reason: `sample max_cost_usd would be exceeded before stage '${stage.slug}'`,
      limit: maxCost,
      actual: roundUsd(cumulativeCost + projectedCost),
    };
  }

  const maxScenes = opts.pipeline.sample.max_scenes;
  const sceneCount = sampleSceneCount(priorArtifacts);
  if (maxScenes !== undefined && sceneCount !== undefined && sceneCount > maxScenes) {
    return {
      status: "limits_exceeded",
      reason: `sample max_scenes exceeded before stage '${stage.slug}'`,
      limit: maxScenes,
      actual: sceneCount,
    };
  }

  if (budget < cumulativeCost) {
    return {
      status: "budget_exceeded",
      reason: `run budget already exceeded before stage '${stage.slug}'`,
      limit: budget,
      actual: cumulativeCost,
    };
  }

  return undefined;
}

function sampleSceneCount(priorArtifacts: Record<string, unknown>): number | undefined {
  const scenePlan = recordValue(priorArtifacts.scene_plan);
  const scenes = scenePlan?.scenes;
  return Array.isArray(scenes) ? scenes.length : undefined;
}

async function writeSampleLimitCheckpoint(input: {
  opts: RunnerOptions;
  stage: Stage;
  reason: string;
  totalCostUsd: number;
  budget: number;
  revisionNotes: Record<string, string[]>;
  now: () => Date;
}): Promise<void> {
  const timestamp = input.now().toISOString();
  await writeCheckpoint(input.opts.projectRoot, input.opts.show.slug, input.opts.episode.slug, input.stage.slug, {
    stage: input.stage.slug,
    status: "failed",
    timestamp,
    artifact: {
      error: "sample_limit_exceeded",
      reason: input.reason,
    },
    cost_snapshot: {
      stage_cost_usd: 0,
      total_so_far_usd: input.totalCostUsd,
      budget_remaining_usd: roundUsd(input.budget - input.totalCostUsd),
    },
    tool_invocations: [],
  });
  await updateState(input.opts.projectRoot, input.opts.show.slug, input.opts.episode.slug, {
    pipeline: input.opts.pipelineName,
    current_stage: input.stage.slug,
    last_status: "failed",
    last_checkpoint_at: timestamp,
    cost_total_usd: input.totalCostUsd,
    revision_notes: input.revisionNotes,
    failed: {
      stage: input.stage.slug,
      error: input.reason,
      last_artifact_path: undefined,
      last_cost_entries: [],
    },
  });
}

function emitSampleLimit(opts: RunnerOptions, failure: SampleLimitFailure): void {
  opts.io.stdout.write(
    `${JSON.stringify({
      event: failure.status,
      reason: failure.reason,
      limit: failure.limit,
      actual: failure.actual,
      sample: true,
    })}\n`,
  );
}

async function writeInProgressCheckpoint(
  opts: RunnerOptions,
  stage: Stage,
  revisionNotes: Record<string, string[]>,
  now: () => Date,
): Promise<void> {
  const timestamp = now().toISOString();
  await writeCheckpoint(opts.projectRoot, opts.show.slug, opts.episode.slug, stage.slug, {
    stage: stage.slug,
    status: "in_progress",
    timestamp,
    artifact: null,
    tool_invocations: [],
  });
  await updateState(opts.projectRoot, opts.show.slug, opts.episode.slug, {
    pipeline: opts.pipelineName,
    current_stage: stage.slug,
    last_status: "in_progress",
    last_checkpoint_at: timestamp,
    revision_notes: revisionNotes,
  });
}

function checkpointForStage(input: {
  stage: Stage;
  status: CheckpointStatus;
  artifact: unknown;
  review: Review;
  stageCostUsd: number;
  totalCostUsd: number;
  budget: number;
  skillsRead: string[];
  playbook: unknown;
  toolInvocations?: Checkpoint["tool_invocations"];
  now: () => Date;
}): Checkpoint {
  return {
    stage: input.stage.slug,
    status: input.status,
    timestamp: input.now().toISOString(),
    artifact: input.artifact,
    review_summary: {
      decision: input.review.decision,
      rounds: input.review.round + 1,
      critical: input.review.summary.critical,
      suggestions: input.review.summary.suggestions,
      nitpicks: input.review.summary.nitpicks,
      findings: input.review.findings,
    },
    cost_snapshot: {
      stage_cost_usd: input.stageCostUsd,
      total_so_far_usd: input.totalCostUsd,
      budget_remaining_usd: roundUsd(input.budget - input.totalCostUsd),
    },
    tool_invocations: input.toolInvocations ?? [],
    style_playbook: input.playbook,
    skills_read: input.skillsRead,
  };
}

async function writeCompletedCheckpointAndState(
  opts: RunnerOptions,
  checkpoint: Checkpoint,
  totalCostUsd: number,
  revisionNotes: Record<string, string[]>,
): Promise<void> {
  await writeCheckpoint(opts.projectRoot, opts.show.slug, opts.episode.slug, checkpoint.stage, checkpoint);
  await writeProducedArtifact(opts, checkpoint.stage, checkpoint.artifact);
  await updateState(opts.projectRoot, opts.show.slug, opts.episode.slug, {
    pipeline: opts.pipelineName,
    current_stage: checkpoint.stage,
    last_status: checkpoint.status,
    last_checkpoint_at: checkpoint.timestamp,
    cost_total_usd: totalCostUsd,
    revision_notes: revisionNotes,
    queued_stage_revision: undefined,
  });
}

async function writeProducedArtifact(opts: RunnerOptions, stageSlug: string, artifact: unknown): Promise<void> {
  const stage = opts.pipeline.stages.find((candidate) => candidate.slug === stageSlug);
  if (stage === undefined || stage.produces.trim() === "") {
    return;
  }

  const artifactDir = projectDir(opts.projectRoot, opts.show.slug, opts.episode.slug);
  await atomicWrite(path.join(artifactDir, `${stage.produces}.json`), `${JSON.stringify(artifact, null, 2)}\n`);

  if (!isRecord(artifact)) {
    return;
  }

  for (const artifactName of stage.produces_artifacts) {
    if (artifactName === stage.produces) {
      continue;
    }

    const nestedArtifact = artifact[artifactName];
    if (nestedArtifact !== undefined) {
      await atomicWrite(path.join(artifactDir, `${artifactName}.json`), `${JSON.stringify(nestedArtifact, null, 2)}\n`);
    }
  }
}

async function recordStageDecisions(opts: RunnerOptions, decisions: DecisionEntry[]): Promise<DecisionEntry[]> {
  for (const decision of decisions) {
    await recordDecision({ show: opts.show.slug, episode: opts.episode.slug }, decision, { root: opts.projectRoot });
  }

  return decisions;
}

async function recordStageCosts(opts: RunnerOptions, result: StageResult): Promise<void> {
  for (const entry of result.cost_entries ?? []) {
    await recordCost(opts.projectRoot, opts.show.slug, opts.episode.slug, entry);
  }
}

async function recordFailureCosts(opts: RunnerOptions, entries: CostEntry[]): Promise<void> {
  for (const entry of entries) {
    await recordCost(opts.projectRoot, opts.show.slug, opts.episode.slug, entry);
  }
}

async function writeFailedErrorCheckpoint(input: {
  opts: RunnerOptions;
  stage: Stage;
  artifact: unknown;
  totalCostUsd: number;
  budget: number;
  toolInvocations: Checkpoint["tool_invocations"];
  revisionNotes: Record<string, string[]>;
  skillsRead: string[];
  playbook: unknown;
  now: () => Date;
}): Promise<void> {
  const timestamp = input.now().toISOString();
  await writeCheckpoint(input.opts.projectRoot, input.opts.show.slug, input.opts.episode.slug, input.stage.slug, {
    stage: input.stage.slug,
    status: "failed",
    timestamp,
    artifact: input.artifact,
    cost_snapshot: {
      stage_cost_usd: input.toolInvocations.reduce((sum, entry) => sum + (entry.usd ?? 0), 0),
      total_so_far_usd: input.totalCostUsd,
      budget_remaining_usd: roundUsd(input.budget - input.totalCostUsd),
    },
    tool_invocations: input.toolInvocations,
    style_playbook: input.playbook,
    skills_read: input.skillsRead,
  });
  await updateState(input.opts.projectRoot, input.opts.show.slug, input.opts.episode.slug, {
    pipeline: input.opts.pipelineName,
    current_stage: input.stage.slug,
    last_status: "failed",
    last_checkpoint_at: timestamp,
    cost_total_usd: input.totalCostUsd,
    revision_notes: input.revisionNotes,
    queued_stage_revision: undefined,
    failed: {
      stage: input.stage.slug,
      error: stringValue(recordValue(input.artifact)?.error) ?? "stage failed",
      last_artifact_path: stringValue(recordValue(input.artifact)?.last_artifact_path),
      last_cost_entries: input.toolInvocations,
    },
  });
}

type FailureDetails = {
  message: string;
  lastArtifactPath?: string;
  costEntries: CostEntry[];
};

function failureDetails(error: unknown): FailureDetails {
  if (isRecord(error)) {
    const message = error instanceof Error ? error.message : stringValue(error.message) ?? String(error);
    const lastArtifactPath = stringValue(error.lastArtifactPath) ?? stringValue(error.last_artifact_path);
    const costEntries = Array.isArray(error.costEntries)
      ? error.costEntries.filter(isCostEntry)
      : Array.isArray(error.last_cost_entries)
        ? error.last_cost_entries.filter(isCostEntry)
        : [];
    return { message, lastArtifactPath, costEntries };
  }

  return {
    message: error instanceof Error ? error.message : String(error),
    costEntries: [],
  };
}

function failureArtifact(details: FailureDetails): Record<string, unknown> {
  return {
    error: details.message,
    ...(details.lastArtifactPath === undefined ? {} : { last_artifact_path: details.lastArtifactPath }),
    last_cost_entries: details.costEntries,
  };
}

function isCostEntry(value: unknown): value is CostEntry {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.tool === "string" &&
    typeof value.provider === "string" &&
    typeof value.model === "string" &&
    typeof value.units === "number" &&
    typeof value.usd === "number" &&
    (value.mode === "sample" || value.mode === "full")
  );
}

function buildToolPolicy(input: {
  opts: RunnerOptions;
  stage: Stage;
  costLog: Awaited<ReturnType<typeof readCostLog>>;
  decisionLog: DecisionLog;
  budget: number;
  cumulativeCost: number;
  priorArtifacts: Record<string, unknown>;
  decisions: DecisionEntry[];
  firstPaidApprovals: Set<string>;
  now: () => Date;
}): ToolExecutionPolicy {
  const previous = majorChangePreviousState(input.decisionLog, input.priorArtifacts, input.opts.runOptions);

  return {
    stage: input.stage.slug,
    timestamp: input.now().toISOString(),
    sampleOrBatch: input.opts.runOptions.sample ? "sample" : "batch",
    budgetUsd: input.budget,
    budgetRemainingUsd: budgetRemainingFromCostLog(input.budget, input.costLog, input.cumulativeCost),
    costLog: input.costLog,
    showEpisode: { show: input.opts.show.slug, episode: input.opts.episode.slug },
    mode: toolInteractionMode(input.opts),
    io: toolInteractionIo(input.opts.io),
    recordDecision: async (entry) => {
      input.decisions.push(entry);
      return await recordDecision({ show: input.opts.show.slug, episode: input.opts.episode.slug }, entry, {
        root: input.opts.projectRoot,
      });
    },
    majorChange: {
      previous,
      next: previous,
      decisionLog: input.decisionLog,
      stage: input.stage.slug,
      timestamp: input.now().toISOString(),
      recordDecision: async (entry) => {
        input.decisions.push(entry);
        return await recordDecision({ show: input.opts.show.slug, episode: input.opts.episode.slug }, entry, {
          root: input.opts.projectRoot,
        });
      },
    },
    firstPaidCallApproval: async ({ tool, reason }) => {
      if (!requiresFirstPaidProjectTool(tool)) {
        return;
      }

      const key = `${tool.source}:${tool.name}`;
      if (input.firstPaidApprovals.has(key)) {
        return;
      }

      const latestDecisionLog = await readDecisionLog(
        { show: input.opts.show.slug, episode: input.opts.episode.slug },
        { root: input.opts.projectRoot },
      );
      if (hasCapabilityExtensionDecision(latestDecisionLog, `tool:${tool.name}`)) {
        input.firstPaidApprovals.add(key);
        return;
      }

      await announceCapabilityExtension({
        kind: "tool",
        name: tool.name,
        why: {
          x: tool.capability,
          y: reason ?? tool.best_for,
        },
        stage: input.stage.slug,
        timestamp: input.now().toISOString(),
        mode: toolInteractionMode(input.opts),
        io: toolInteractionIo(input.opts.io),
        showEpisode: { show: input.opts.show.slug, episode: input.opts.episode.slug },
        requiresApproval: true,
        recordDecision: async (entry) => {
          input.decisions.push(entry);
          return await recordDecision({ show: input.opts.show.slug, episode: input.opts.episode.slug }, entry, {
            root: input.opts.projectRoot,
          });
        },
      });
      input.firstPaidApprovals.add(key);
    },
  };
}

function requiresFirstPaidProjectTool(tool: Tool): boolean {
  return (
    tool.source === "project" &&
    tool.requires_first_call_approval === true &&
    tool.integration.kind === "api" &&
    tool.cost !== undefined &&
    tool.cost.usd > 0
  );
}

function hasCapabilityExtensionDecision(log: DecisionLog, picked: string): boolean {
  return log.some((entry) => entry.category === "capability_extension" && entry.picked === picked);
}

function budgetRemainingFromCostLog(budget: number, costLog: Awaited<ReturnType<typeof readCostLog>>, fallbackCost: number): number {
  const loggedCost = costLog.reduce((sum, entry) => sum + entry.usd, 0);
  return roundUsd(budget - Math.max(loggedCost, fallbackCost));
}

function toolInteractionMode(opts: RunnerOptions): ToolExecutionPolicy["mode"] {
  if (opts.json === true) {
    return { json: true };
  }

  return opts.runOptions.nonInteractive === true ? "non_interactive" : "interactive";
}

function toolInteractionIo(io: CliIo): ToolInteractionIO {
  return {
    write(message) {
      io.stderr.write(`${message}\n`);
    },
    event(event, payload) {
      io.stdout.write(`${JSON.stringify({ event, ...objectPayload(payload) })}\n`);
    },
  };
}

function majorChangePreviousState(
  decisionLog: DecisionLog,
  priorArtifacts: Record<string, unknown>,
  runOptions: StageRunOptions,
): ToolExecutionState {
  const decisions = currentDecisions(decisionLog);
  const proposal = recordValue(priorArtifacts.proposal);
  const deliveryPromise = recordValue(proposal?.delivery_promise);
  const productionPlan = recordValue(proposal?.production_plan);

  return {
    provider: latestPicked(decisions, "provider_selection"),
    model: latestPicked(decisions, "model_selection"),
    runtime: latestPicked(decisions, "render_runtime_selection") ?? stringValue(productionPlan?.render_runtime),
    narrationPresent: booleanValue(deliveryPromise?.narration_present),
    musicPresent: booleanValue(deliveryPromise?.music_present),
    sampleOrBatch: runOptions.sample ? "sample" : undefined,
  };
}

function latestPicked(decisions: DecisionEntry[], category: DecisionEntry["category"]): string | undefined {
  return decisions.filter((decision) => decision.category === category).at(-1)?.picked;
}

async function completedStageSlugs(opts: RunnerOptions): Promise<Set<string>> {
  const completed = new Set<string>();

  for (const stageSlug of await listCheckpoints(opts.projectRoot, opts.show.slug, opts.episode.slug)) {
    const checkpoint = await readCheckpoint(opts.projectRoot, opts.show.slug, opts.episode.slug, stageSlug);
    if (checkpoint.status === "completed") {
      completed.add(stageSlug);
    }
  }

  return completed;
}

async function checkpointStatusMap(opts: RunnerOptions): Promise<CheckpointStatusMap> {
  const statuses: CheckpointStatusMap = new Map();

  for (const stageSlug of await listCheckpoints(opts.projectRoot, opts.show.slug, opts.episode.slug)) {
    const checkpoint = await readCheckpoint(opts.projectRoot, opts.show.slug, opts.episode.slug, stageSlug);
    statuses.set(stageSlug, checkpoint.status);
  }

  return statuses;
}

function checkpointStatusForStage(opts: RunnerOptions, stage: Stage, overBudget: boolean): CheckpointStatus {
  if (overBudget || opts.runOptions.sample === true || stage.human_approval !== "required") {
    return "completed";
  }

  return "awaiting_human";
}

function buildApprovalContext(
  checkpoint: Checkpoint,
  budget: number,
  nextStage: Stage | undefined,
  remainingStages: readonly Stage[] = [],
): ApprovalContext {
  const snapshot = checkpoint.cost_snapshot ?? ZERO_COST;
  return {
    stageCost: snapshot.stage_cost_usd,
    totalSoFar: snapshot.total_so_far_usd,
    budgetRemaining: snapshot.budget_remaining_usd,
    projectedNextStage: projectedNextStage(nextStage),
    projectedRemainingTotals: projectedRemainingTotals(remainingStages),
    artifactSummary: summarizeArtifact(checkpoint.artifact),
  };
}

function projectedNextStage(stage: Stage | undefined): ApprovalContext["projectedNextStage"] {
  if (stage?.estimated_cost === undefined) {
    return undefined;
  }

  return {
    stage: stage.slug,
    sample: stage.estimated_cost.sample.usd,
    full: stage.estimated_cost.full.usd,
  };
}

function projectedRemainingTotals(stages: readonly Stage[]): ApprovalContext["projectedRemainingTotals"] | undefined {
  const totals = stages.reduce(
    (sum, stage) => {
      if (stage.estimated_cost === undefined) {
        return sum;
      }

      return {
        sample: roundUsd(sum.sample + stage.estimated_cost.sample.usd),
        full: roundUsd(sum.full + stage.estimated_cost.full.usd),
      };
    },
    { sample: 0, full: 0 },
  );

  return totals.sample > 0 || totals.full > 0 ? totals : undefined;
}

function finalReviewFromStageResult(stage: Stage, result: StageResult): FinalReview | undefined {
  if (stage.slug !== "compose" && stage.slug !== "final_review") {
    return undefined;
  }

  const direct = FinalReviewSchema.safeParse(result.artifact);
  if (direct.success) {
    return direct.data;
  }

  const artifact = recordValue(result.artifact);
  const nested = FinalReviewSchema.safeParse(artifact?.final_review);
  return nested.success ? nested.data : undefined;
}

function preserveFailedRender(opts: RunnerOptions, result: StageResult, finalReview: FinalReview): string {
  const renderPath = renderPathFromArtifact(opts, result.artifact);
  return haltOnFinalReviewFail(finalReview, {
    show: opts.show.slug,
    episode: opts.episode.slug,
    root: opts.projectRoot,
    renderPath: renderPath !== undefined && existsSync(renderPath) ? renderPath : undefined,
  }).preservedPath;
}

function renderPathFromArtifact(opts: RunnerOptions, artifact: unknown): string | undefined {
  const artifactRecord = recordValue(artifact);
  const renderReport = recordValue(artifactRecord?.render_report);
  const candidate =
    stringValue(artifactRecord?.render_path) ??
    stringValue(artifactRecord?.video_path) ??
    stringValue(artifactRecord?.output_path) ??
    stringValue(renderReport?.output_path);

  if (candidate === undefined) {
    return undefined;
  }

  if (path.isAbsolute(candidate)) {
    return candidate;
  }

  if (candidate === "projects" || candidate.startsWith("projects/")) {
    return path.resolve(opts.projectRoot, candidate);
  }

  return path.join(projectDir(opts.projectRoot, opts.show.slug, opts.episode.slug), candidate);
}

function emitFinalReviewFailed(opts: RunnerOptions, stage: string, preservedPath: string): void {
  opts.io.stdout.write(
    `${JSON.stringify({
      event: "final_review_failed",
      show: opts.show.slug,
      episode: opts.episode.slug,
      stage,
      preserved_path: preservedPath,
      cta: "predit approve --force <reason>",
    })}\n`,
  );
}

function summarizeArtifact(artifact: unknown): string[] {
  if (Array.isArray(artifact)) {
    return [`${artifact.length} array item${artifact.length === 1 ? "" : "s"}`];
  }

  if (!isRecord(artifact)) {
    return [String(artifact)];
  }

  const preferred = ["title", "summary", "description", "hook", "topic_exploration"]
    .map((key) => artifact[key])
    .filter((value): value is string => typeof value === "string" && value.length > 0);
  if (preferred.length > 0) {
    return preferred;
  }

  return Object.entries(artifact)
    .slice(0, 5)
    .map(([key, value]) => `${key}: ${summaryValue(value)}`);
}

function summaryValue(value: unknown): string {
  if (Array.isArray(value)) {
    return `${value.length} item${value.length === 1 ? "" : "s"}`;
  }
  if (isRecord(value)) {
    return `${Object.keys(value).length} field${Object.keys(value).length === 1 ? "" : "s"}`;
  }
  if (typeof value === "string") {
    return value.length > 120 ? `${value.slice(0, 117)}...` : value;
  }
  return String(value);
}

function reviewRevisionNote(review: Review): string {
  const critical = review.findings.filter((finding) => finding.severity === "critical");
  if (critical.length === 0) {
    return `Reviewer requested revision on round ${review.round + 1}.`;
  }

  return critical.map((finding) => `${finding.title}: ${finding.proposed_fix ?? finding.description}`).join("\n");
}

function appendRevisionNote(revisionNotes: Record<string, string[]>, stage: string, note: string): void {
  revisionNotes[stage] = [...(revisionNotes[stage] ?? []), note];
}

function normalizeApprovalPromptResult(result: ApprovalPromptResult): { action: ApprovalAction; note?: string } {
  if (typeof result === "string") {
    return { action: result };
  }

  return result;
}

function shouldResume(runOptions: StageRunOptions): boolean {
  return runOptions.from === undefined && runOptions.only === undefined;
}

function queuedRevisionForStage(state: PipelineState | undefined, stage: string): string | undefined {
  return state?.queued_stage_revision?.stage === stage ? state.queued_stage_revision.note : undefined;
}

async function clearQueuedRevision(opts: RunnerOptions): Promise<void> {
  await updateState(opts.projectRoot, opts.show.slug, opts.episode.slug, {
    queued_stage_revision: undefined,
  });
}

function cloneRevisionNotes(value: PipelineState["revision_notes"]): Record<string, string[]> {
  return Object.fromEntries(Object.entries(value ?? {}).map(([stage, notes]) => [stage, [...notes]]));
}

function resolveBudget(opts: RunnerOptions): number {
  return (
    opts.runOptions.budget_usd ??
    opts.episode.budget_usd ??
    opts.show.pipelines[opts.pipelineName]?.budget_usd ??
    opts.pipeline.orchestration.budget_default_usd
  );
}

function estimatedStageCost(stage: Stage, runOptions: StageRunOptions): number | undefined {
  if (stage.estimated_cost === undefined) {
    return undefined;
  }

  return runOptions.sample ? stage.estimated_cost.sample.usd : stage.estimated_cost.full.usd;
}

function estimatedCostForReview(
  pipeline: PipelineManifest,
  stage: Stage,
  runOptions: StageRunOptions,
): number | undefined {
  if (!isProposalStageSlug(stage.slug)) {
    return estimatedStageCost(stage, runOptions);
  }

  return totalEstimatedCost(pipeline, false) ?? estimatedStageCost(stage, runOptions);
}

function cumulativeEstimatedCost(pipeline: PipelineManifest, stageSlug: string, runOptions: StageRunOptions): number {
  let total = 0;

  for (const stage of pipeline.stages) {
    total = roundUsd(total + (estimatedStageCost(stage, runOptions) ?? 0));

    if (stage.slug === stageSlug) {
      break;
    }
  }

  return total;
}

function totalEstimatedCost(pipeline: PipelineManifest, sample: boolean): number | undefined {
  let total = 0;
  let hasEstimate = false;

  for (const stage of pipeline.stages) {
    if (stage.estimated_cost === undefined) {
      continue;
    }

    total = roundUsd(total + (sample ? stage.estimated_cost.sample.usd : stage.estimated_cost.full.usd));
    hasEstimate = true;
  }

  return hasEstimate ? total : undefined;
}

function isProposalStageSlug(stageSlug: string): boolean {
  return stageSlug === "proposal" || stageSlug === "proposal_packet";
}

function reviewPlaybook(playbook: unknown): ReviewContext["playbook"] {
  const parsed = PlaybookSchema.safeParse(playbook);
  return parsed.success ? parsed.data : undefined;
}

function wallTimeExceeded(pipeline: PipelineManifest, startMs: number, now: () => Date): boolean {
  const maxMs = pipeline.orchestration.max_wall_time_minutes * 60_000;
  return now().getTime() - startMs > maxMs;
}

function emitBudgetWarning(opts: RunnerOptions, totalCostUsd: number, budget: number): void {
  const payload = {
    event: "budget_exceeded",
    total_cost_usd: totalCostUsd,
    budget_usd: budget,
  };

  if (opts.json === true) {
    opts.io.stdout.write(`${JSON.stringify(payload)}\n`);
    return;
  }

  opts.io.stdout.write(`budget exceeded: $${totalCostUsd.toFixed(2)} of $${budget.toFixed(2)}\n`);
}

function roundUsd(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function objectPayload(payload: unknown): Record<string, unknown> {
  return isRecord(payload) ? payload : { payload };
}

function recordValue(value: unknown): Record<string, unknown> | undefined {
  return isRecord(value) ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
