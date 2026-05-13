import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import type { AssetManifest } from "../artifacts/asset-manifest.js";
import type { DecisionLog } from "../artifacts/decision-log.js";
import type { EditDecisions } from "../artifacts/edit-decisions.js";
import type { ProposalPacket } from "../artifacts/proposal-packet.js";
import type { RenderRuntime } from "../artifacts/enums.js";

export const PROMISE_RULES = {
  min_motion_ratio: 0.7,
} as const;

export const PreComposeFindingSchema = z.object({
  check: z.string(),
  status: z.enum(["pass", "fail"]),
  detail: z.string(),
});

export const PreComposeValidationResultSchema = z.object({
  status: z.enum(["passed", "failed"]),
  findings: z.array(PreComposeFindingSchema),
  motion_ratio_actual: z.number().nonnegative().optional(),
});

export type PreComposeFinding = z.infer<typeof PreComposeFindingSchema>;
export type PreComposeValidationResult = z.infer<typeof PreComposeValidationResultSchema>;

export type PreComposeValidationInput = {
  edit_decisions: EditDecisions;
  proposal_packet?: ProposalPacket;
  asset_manifest?: AssetManifest;
  decision_log?: DecisionLog;
  projectRoot?: string;
  planned_duration_s?: number;
};

const COVERAGE_TOLERANCE_S = 0.001;
const VIDEO_PROVIDERS = new Set(["higgsfield", "kling", "luma", "pika", "runway", "veo"]);

export function validatePreCompose(input: PreComposeValidationInput): PreComposeValidationResult {
  const assetById = new Map((input.asset_manifest?.assets ?? []).map((asset) => [asset.id, asset]));
  const motionRatio = computeMotionRatio(input.edit_decisions, assetById);
  const findings = [
    validateDeliveryPromise(input.proposal_packet, motionRatio),
    validateRuntimeMatch(input.edit_decisions.render_runtime, input.proposal_packet, input.decision_log),
    validateAssetPaths(input.edit_decisions, input.asset_manifest, input.projectRoot ?? process.cwd()),
    validateCutCoverage(input.edit_decisions, input.planned_duration_s),
  ];

  const result = {
    status: findings.some((finding) => finding.status === "fail") ? "failed" : "passed",
    findings,
    motion_ratio_actual: motionRatio,
  } satisfies PreComposeValidationResult;

  return PreComposeValidationResultSchema.parse(result);
}

export function hasRuntimeSupersession(
  decisionLog: DecisionLog | undefined,
  expected: RenderRuntime,
  actual: RenderRuntime,
): boolean {
  const entriesById = new Map((decisionLog ?? []).map((entry) => [entry.id, entry]));

  return (decisionLog ?? []).some((entry) => {
    const superseded = entry.supersedes === null ? undefined : entriesById.get(entry.supersedes);

    return (
      entry.category === "render_runtime_selection" &&
      entry.picked === actual &&
      superseded?.category === "render_runtime_selection" &&
      superseded.picked === expected &&
      entry.options_considered.some((option) => option.label === expected)
    );
  });
}

function validateDeliveryPromise(
  proposal: ProposalPacket | undefined,
  motionRatio: number,
): PreComposeFinding {
  if (!proposal?.delivery_promise.motion_led) {
    return {
      check: "delivery_promise",
      status: "pass",
      detail: "No motion-led delivery promise requires a motion-ratio floor.",
    };
  }

  if (motionRatio >= PROMISE_RULES.min_motion_ratio) {
    return {
      check: "delivery_promise",
      status: "pass",
      detail: `motion_ratio ${round(motionRatio)} meets floor ${PROMISE_RULES.min_motion_ratio}.`,
    };
  }

  return {
    check: "delivery_promise",
    status: "fail",
    detail: `motion_ratio ${round(motionRatio)} is below motion-led floor ${PROMISE_RULES.min_motion_ratio}.`,
  };
}

function validateRuntimeMatch(
  editRuntime: RenderRuntime,
  proposal: ProposalPacket | undefined,
  decisionLog: DecisionLog | undefined,
): PreComposeFinding {
  const proposalRuntime = proposal?.production_plan.render_runtime;

  if (proposalRuntime === undefined || proposalRuntime === editRuntime) {
    return {
      check: "runtime_match",
      status: "pass",
      detail: proposalRuntime === undefined ? "No proposal runtime was supplied." : `Runtime remains ${editRuntime}.`,
    };
  }

  if (hasRuntimeSupersession(decisionLog, proposalRuntime, editRuntime)) {
    return {
      check: "runtime_match",
      status: "pass",
      detail: `Runtime changed from ${proposalRuntime} to ${editRuntime} with a superseding decision log entry.`,
    };
  }

  return {
    check: "runtime_match",
    status: "fail",
    detail: `edit_decisions.render_runtime ${editRuntime} does not match proposal render_runtime ${proposalRuntime}; no supersession was logged.`,
  };
}

function validateAssetPaths(
  editDecisions: EditDecisions,
  assetManifest: AssetManifest | undefined,
  projectRoot: string,
): PreComposeFinding {
  if (assetManifest === undefined) {
    return {
      check: "asset_manifest_required",
      status: "fail",
      detail: "No asset_manifest was supplied, so edit_decisions.cuts asset_id values cannot be resolved to filesystem paths.",
    };
  }

  const assetById = new Map((assetManifest?.assets ?? []).map((asset) => [asset.id, asset]));
  const missing: string[] = [];
  const checked = new Set<string>();

  for (const cut of editDecisions.cuts) {
    const asset = assetById.get(cut.asset_id);

    if (assetManifest && asset === undefined) {
      missing.push(`${cut.asset_id} (not in asset_manifest)`);
      continue;
    }

    const path = asset?.path ?? cut.asset_id;
    const absolutePath = resolveAssetPath(path, projectRoot);
    checked.add(absolutePath);

    if (!existsSync(absolutePath)) {
      missing.push(path);
    }
  }

  for (const asset of assetManifest?.assets ?? []) {
    const absolutePath = resolveAssetPath(asset.path, projectRoot);
    checked.add(absolutePath);

    if (!existsSync(absolutePath)) {
      missing.push(asset.path);
    }
  }

  if (missing.length > 0) {
    return {
      check: "asset_paths_exist",
      status: "fail",
      detail: `Missing assets: ${dedupe(missing).join(", ")}.`,
    };
  }

  return {
    check: "asset_paths_exist",
    status: "pass",
    detail: `Verified ${checked.size} asset path(s).`,
  };
}

function validateCutCoverage(editDecisions: EditDecisions, plannedDurationS?: number): PreComposeFinding {
  if (editDecisions.cuts.length === 0) {
    return {
      check: "cut_coverage",
      status: "fail",
      detail: "No cuts were supplied.",
    };
  }

  const cuts = [...editDecisions.cuts].sort((left, right) => left.start_s - right.start_s);
  const first = cuts[0];

  if (!first || first.start_s > COVERAGE_TOLERANCE_S) {
    return {
      check: "cut_coverage",
      status: "fail",
      detail: `First cut starts at ${first?.start_s ?? "none"}s instead of 0s.`,
    };
  }

  let previousEnd = 0;

  for (const cut of cuts) {
    if (cut.end_s <= cut.start_s) {
      return {
        check: "cut_coverage",
        status: "fail",
        detail: `Cut ${cut.asset_id} has non-positive duration (${cut.start_s}s to ${cut.end_s}s).`,
      };
    }

    if (cut.start_s - previousEnd > COVERAGE_TOLERANCE_S) {
      return {
        check: "cut_coverage",
        status: "fail",
        detail: `Gap from ${previousEnd}s to ${cut.start_s}s before cut ${cut.asset_id}.`,
      };
    }

    if (previousEnd - cut.start_s > COVERAGE_TOLERANCE_S) {
      return {
        check: "cut_coverage",
        status: "fail",
        detail: `Overlap from ${cut.start_s}s to ${previousEnd}s at cut ${cut.asset_id}.`,
      };
    }

    previousEnd = cut.end_s;
  }

  if (plannedDurationS !== undefined && Math.abs(previousEnd - plannedDurationS) > COVERAGE_TOLERANCE_S) {
    return {
      check: "cut_coverage",
      status: "fail",
      detail: `Cuts cover 0s through ${previousEnd}s, but planned duration is ${plannedDurationS}s.`,
    };
  }

  return {
    check: "cut_coverage",
    status: "pass",
    detail: `Cuts cover 0s through ${previousEnd}s without gaps or overlaps.`,
  };
}

function computeMotionRatio(editDecisions: EditDecisions, assetById: Map<string, AssetManifest["assets"][number]>): number {
  const totalDuration = editDecisions.cuts.reduce((total, cut) => total + cutDuration(cut), 0);

  if (totalDuration === 0) {
    return 0;
  }

  const motionDuration = editDecisions.cuts.reduce((total, cut) => {
    const asset = assetById.get(cut.asset_id);
    return isMotionCut(cut.provider, asset?.kind) ? total + cutDuration(cut) : total;
  }, 0);

  return motionDuration / totalDuration;
}

function isMotionCut(provider: string | undefined, assetKind: string | undefined): boolean {
  const kind = assetKind?.toLowerCase();
  if (kind === "video" || kind === "clip" || kind === "motion") {
    return true;
  }

  const normalizedProvider = provider?.toLowerCase();
  return normalizedProvider !== undefined && (VIDEO_PROVIDERS.has(normalizedProvider) || normalizedProvider.includes("video"));
}

function cutDuration(cut: EditDecisions["cuts"][number]): number {
  return Math.max(0, cut.end_s - cut.start_s);
}

function resolveAssetPath(path: string, projectRoot: string): string {
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

function dedupe(items: string[]): string[] {
  return [...new Set(items)];
}

function round(value: number): number {
  return Math.round(value * 1_000) / 1_000;
}
