import type { DecisionEntry, DecisionLog } from "../artifacts/decision-log.js";
import type { RenderRuntime } from "../artifacts/enums.js";
import type { ProposalPacket } from "../artifacts/proposal-packet.js";
import type { RenderReport } from "../artifacts/render-report.js";
import type { Finding } from "../artifacts/review.js";
import { currentDecisions } from "../decisions/store.js";

type UnknownRecord = Record<string, unknown>;

export type RuntimeSwapContext = {
  proposalPacket?: ProposalPacket;
  renderReport?: RenderReport;
  decisionLog?: DecisionLog;
};

export function checkRuntimeSwap(stageSlug: string, artifact: unknown, ctx: RuntimeSwapContext = {}): Finding[] {
  if (!isComposeStage(stageSlug)) {
    return [];
  }

  const proposal = ctx.proposalPacket;
  const report = ctx.renderReport ?? renderReportFromArtifact(artifact);
  if (proposal === undefined || report === undefined) {
    return [];
  }

  const proposed = proposal.production_plan.render_runtime;
  const actual = report.runtime_used;
  if (actual === proposed || hasSupersedingRuntimeDecision(ctx.decisionLog, proposed, actual)) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Silent runtime swap between proposal and compose",
      location: "render_report.runtime_used",
      description: `Compose used runtime "${actual}", but proposal locked "${proposed}" and no superseding render_runtime_selection decision approved the swap.`,
      proposed_fix:
        `Restore render_report.runtime_used to "${proposed}", or call recordDecision with a user-visible render_runtime_selection entry that picks "${actual}" and supersedes the proposal runtime decision before compose proceeds.`,
      patch: {
        artifact_path: "render_report.runtime_used",
        new_value: proposed,
      },
      status: "pending",
    },
  ];
}

function hasSupersedingRuntimeDecision(
  decisionLog: DecisionLog | undefined,
  proposed: RenderRuntime,
  actual: RenderRuntime,
): boolean {
  const log = decisionLog ?? [];
  const active = currentDecisions(log);
  const proposalDecision = latestRuntimeDecisionFor(log, proposed, "proposal");

  return active.some((decision) => {
    return (
      decision.category === "render_runtime_selection" &&
      decision.picked === actual &&
      isStageBetweenProposalAndCompose(decision.stage) &&
      decision.supersedes !== null &&
      (proposalDecision === undefined || decision.supersedes === proposalDecision.id)
    );
  });
}

function latestRuntimeDecisionFor(
  decisions: readonly DecisionEntry[],
  picked: RenderRuntime,
  stage: string,
): DecisionEntry | undefined {
  return decisions
    .filter((decision) => decision.category === "render_runtime_selection" && decision.picked === picked && normalizeStage(decision.stage) === stage)
    .at(-1);
}

function renderReportFromArtifact(artifact: unknown): RenderReport | undefined {
  if (!isRecord(artifact) || !isRenderRuntime(artifact.runtime_used)) {
    return undefined;
  }

  return artifact as RenderReport;
}

function isComposeStage(stageSlug: string): boolean {
  const normalized = normalizeStage(stageSlug);
  return normalized === "compose";
}

function isStageBetweenProposalAndCompose(stageSlug: string): boolean {
  const order = ["proposal", "script", "cuesheet", "scene_plan", "assets", "edit", "compose"];
  const index = order.indexOf(normalizeStage(stageSlug));

  return index > 0 && index <= order.indexOf("compose");
}

function normalizeStage(stageSlug: string): string {
  if (stageSlug === "render_report") {
    return "compose";
  }

  return stageSlug;
}

function isRenderRuntime(value: unknown): value is RenderRuntime {
  return value === "ffmpeg" || value === "remotion" || value === "hyperframes";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
