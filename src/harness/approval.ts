import type { Checkpoint } from "../checkpoints/index.js";
import type { CliIo } from "../cli/commands/stub.js";

export type ApprovalAction = "approve" | "revise" | "abort";

export type ApprovalContext = {
  stageCost: number;
  totalSoFar: number;
  budgetRemaining: number;
  projectedNextStage?: {
    sample?: number;
    full?: number;
    stage?: string;
  };
  projectedRemainingTotals?: {
    sample: number;
    full: number;
  };
  actions?: ReadonlyArray<ApprovalAction>;
  artifactSummary?: string[];
};

export type ApprovalCounts = {
  critical: number;
  suggestions: number;
  nitpicks: number;
};

export type ApprovalCriticalFinding = {
  title: string;
  location?: string;
  description: string;
  proposed_fix?: string;
  patch?: unknown;
};

export type ApprovalEvent =
  | {
      event: "approval_block_start";
      stage: string;
    }
  | {
      event: "artifact_summary";
      stage: string;
      bullets: string[];
    }
  | {
      event: "review_findings";
      stage: string;
      counts: ApprovalCounts;
      critical_findings: ApprovalCriticalFinding[];
    }
  | {
      event: "cost_snapshot";
      stage: string;
      stage_cost_usd: number;
      total_so_far_usd: number;
      budget_remaining_usd: number;
      projected_next_stage?: ApprovalContext["projectedNextStage"];
      projected_remaining_totals?: ApprovalContext["projectedRemainingTotals"];
    }
  | {
      event: "action_options";
      stage: string;
      actions: ApprovalAction[];
    };

const DEFAULT_ACTIONS: readonly ApprovalAction[] = ["approve", "revise", "abort"];

export function formatApprovalBlock(checkpoint: Checkpoint, ctx: ApprovalContext): string {
  const bullets = artifactSummaryBullets(ctx.artifactSummary);
  const counts = reviewCounts(checkpoint);
  const criticalFindings = criticalFindingsForApproval(checkpoint);
  const actions = actionOptions(ctx);
  const sections = [
    `## Stage complete: ${checkpoint.stage}`,
    ["### Artifact summary", ...bullets.map((bullet) => `- ${bullet}`)].join("\n"),
    ["### Review findings", formatReviewCounts(counts), ...criticalFindings.map(formatCriticalFinding)].join(
      "\n\n",
    ),
    ["### Cost so far", formatCostLine(ctx)].join("\n"),
    ["### Action", `Options: ${actions.join(" | ")}`, formatActionText(actions)].join("\n"),
  ];

  return sections.join("\n\n");
}

export function formatApprovalEvents(checkpoint: Checkpoint, ctx: ApprovalContext): ApprovalEvent[] {
  const actions = actionOptions(ctx);

  return [
    {
      event: "approval_block_start",
      stage: checkpoint.stage,
    },
    {
      event: "artifact_summary",
      stage: checkpoint.stage,
      bullets: artifactSummaryBullets(ctx.artifactSummary),
    },
    {
      event: "review_findings",
      stage: checkpoint.stage,
      counts: reviewCounts(checkpoint),
      critical_findings: criticalFindingsForApproval(checkpoint),
    },
    {
      event: "cost_snapshot",
      stage: checkpoint.stage,
      stage_cost_usd: ctx.stageCost,
      total_so_far_usd: ctx.totalSoFar,
      budget_remaining_usd: ctx.budgetRemaining,
      projected_next_stage: ctx.projectedNextStage,
      projected_remaining_totals: ctx.projectedRemainingTotals,
    },
    {
      event: "action_options",
      stage: checkpoint.stage,
      actions,
    },
  ];
}

export function writeApprovalBlock(
  io: CliIo,
  checkpoint: Checkpoint,
  ctx: ApprovalContext,
  opts: { json: boolean },
): void {
  if (opts.json) {
    for (const event of formatApprovalEvents(checkpoint, ctx)) {
      io.stdout.write(`${JSON.stringify(event)}\n`);
    }
    return;
  }

  io.stdout.write(`${formatApprovalBlock(checkpoint, ctx)}\n`);
}

function artifactSummaryBullets(summary: string[] | undefined): string[] {
  if (!summary || summary.length === 0) {
    return ["(no summary provided)"];
  }

  if (summary.length <= 5) {
    return summary;
  }

  const visible = summary.slice(0, 4);
  return [...visible, `... (${summary.length - visible.length} more)`];
}

function reviewCounts(checkpoint: Checkpoint): ApprovalCounts {
  return {
    critical: checkpoint.review_summary?.critical ?? 0,
    suggestions: checkpoint.review_summary?.suggestions ?? 0,
    nitpicks: checkpoint.review_summary?.nitpicks ?? 0,
  };
}

function formatReviewCounts(counts: ApprovalCounts): string {
  return `Critical: ${counts.critical} | Suggestions: ${counts.suggestions} | Nitpicks: ${counts.nitpicks}`;
}

function criticalFindingsForApproval(checkpoint: Checkpoint): ApprovalCriticalFinding[] {
  return (checkpoint.review_summary?.findings ?? [])
    .filter(isCriticalFinding)
    .map((finding) => ({
      title: stringField(finding.title, "(untitled critical finding)"),
      location: typeof finding.location === "string" ? finding.location : undefined,
      description: stringField(finding.description, JSON.stringify(finding)),
      proposed_fix: typeof finding.proposed_fix === "string" ? finding.proposed_fix : undefined,
      patch: "patch" in finding ? finding.patch : undefined,
    }));
}

function formatCriticalFinding(finding: ApprovalCriticalFinding): string {
  const lines = [`#### Critical finding: ${finding.title}`];

  if (finding.location) {
    lines.push(`Location: ${finding.location}`);
  }

  lines.push("Description:", finding.description);

  if (finding.proposed_fix !== undefined) {
    lines.push("Proposed fix:", finding.proposed_fix);
  } else if (finding.patch !== undefined) {
    lines.push("Patch:", JSON.stringify(finding.patch, null, 2));
  }

  return lines.join("\n");
}

function formatCostLine(ctx: ApprovalContext): string {
  const totalBudget = ctx.totalSoFar + ctx.budgetRemaining;
  const projection = formatProjection(ctx.projectedNextStage);
  const projectedRemaining = formatProjectedRemainingTotals(ctx.projectedRemainingTotals);
  return `${formatUsd(ctx.totalSoFar)} of ${formatUsd(totalBudget)} budget (${formatUsd(
    ctx.budgetRemaining,
  )} remaining). This stage: ${formatUsd(ctx.stageCost)}.${projection}${projectedRemaining}`;
}

function formatProjection(projectedNextStage: ApprovalContext["projectedNextStage"]): string {
  if (!projectedNextStage) {
    return "";
  }

  const estimates: string[] = [];
  if (projectedNextStage.full !== undefined) {
    estimates.push(`${formatUsd(projectedNextStage.full)} full`);
  }
  if (projectedNextStage.sample !== undefined) {
    estimates.push(`${formatUsd(projectedNextStage.sample)} sample`);
  }
  if (estimates.length === 0) {
    return "";
  }

  return ` Next stage (${projectedNextStage.stage ?? "next"}) estimates ${estimates.join(" / ")}.`;
}

function formatProjectedRemainingTotals(totals: ApprovalContext["projectedRemainingTotals"]): string {
  if (totals === undefined) {
    return "";
  }

  return ` Projected remaining: ${formatUsd(totals.full)} full / ${formatUsd(totals.sample)} sample.`;
}

function formatUsd(value: number): string {
  const sign = value < 0 ? "-" : "";
  return `${sign}$${Math.abs(value).toFixed(2)}`;
}

function actionOptions(ctx: ApprovalContext): ApprovalAction[] {
  return [...(ctx.actions ?? DEFAULT_ACTIONS)];
}

function formatActionText(actions: ApprovalAction[]): string {
  if (
    actions.length === DEFAULT_ACTIONS.length &&
    DEFAULT_ACTIONS.every((action, index) => actions[index] === action)
  ) {
    return "Approve to continue, revise with notes, or abort.";
  }

  return `Available actions: ${actions.join(", ")}.`;
}

function isCriticalFinding(value: unknown): value is Record<string, unknown> & { severity: "critical" } {
  return isRecord(value) && value.severity === "critical";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringField(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}
