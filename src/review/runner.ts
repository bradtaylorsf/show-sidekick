import type { CostLog } from "../artifacts/cost-log.js";
import type { Checkpoint } from "../checkpoints/checkpoint.js";
import type { DecisionLog } from "../artifacts/decision-log.js";
import type { EditDecisions } from "../artifacts/edit-decisions.js";
import type { FinalReview } from "../artifacts/final-review.js";
import type { RenderRuntime } from "../artifacts/enums.js";
import type { ProposalPacket } from "../artifacts/proposal-packet.js";
import type { RenderReport } from "../artifacts/render-report.js";
import { ReviewSchema, type Finding, type Review } from "../artifacts/review.js";
import type { SourceMediaReview } from "../artifacts/source-media-review.js";
import type { VideoAnalysisBrief } from "../artifacts/video-analysis-brief.js";
import { auditBoilerplateReason, auditConfidence, auditRequiredCategories } from "../decisions/audit.js";
import type { PipelineManifest } from "../pipelines/manifest.js";
import type { Playbook } from "../shows/playbook.js";
import { validateComposition } from "./composition-validator.js";
import { checkCreativeDifferentiation } from "./creative-differentiation.js";
import {
  checkDeliveryPromise,
  type ClassifyBriefInput,
  type DeliveryPromise,
  type PromiseAsset,
} from "./delivery-promise.js";
import { checkFinalReview } from "./final-review.js";
import { evaluateFocusItem, type FocusEvaluatorHook } from "./focus-evaluator.js";
import { findSameClassInstances } from "./pattern-match.js";
import { crossCheckAgainstPlaybook } from "./playbook-check.js";
import { checkReferenceAlignment } from "./reference-alignment.js";
import { validateArtifactAgainstSchema } from "./schema-validate.js";
import { enforceCHAI, type CHAIEnforcementEvent } from "./specificity.js";
import { checkSkillCompliance } from "./skill-compliance.js";
import { checkSourceMediaEnforcement, type UserSuppliedMedia } from "./source-media-enforcement.js";
import { evaluateSuccessCriteria } from "./success-criteria.js";
import { checkRuntimeSwap } from "./runtime-swap.js";
import { checkSampleFirstProtocol } from "./sample-first.js";

type UnknownRecord = Record<string, unknown>;

export type ReviewContext = {
  pipeline: Pick<PipelineManifest, "stages">;
  round?: number;
  playbook?: Playbook;
  priorReviews?: Review[];
  events?: CHAIEnforcementEvent[];
  focusEvaluators?: Record<string, FocusEvaluatorHook>;
  referenceBrief?: VideoAnalysisBrief;
  costLog?: CostLog;
  approvedProposalAssets?: string[];
  decisionLog?: DecisionLog;
  audioLed?: boolean;
  narrationInScope?: boolean;
  deviatesFromScenePlan?: boolean;
  substituted?: boolean;
  decisionCapabilities?: string[];
  providersWithMultipleModels?: string[];
  sourceMediaReview?: SourceMediaReview;
  userSuppliedMedia?: UserSuppliedMedia[];
  plannedDurationS?: number;
  deliveryPromise?: DeliveryPromise;
  brief?: ClassifyBriefInput;
  assets?: PromiseAsset[];
  narrationRequired?: boolean;
  narrationPresent?: boolean;
  approvedFallback?: string;
  scenes?: UnknownRecord[];
  proposalPacket?: ProposalPacket;
  editDecisions?: EditDecisions;
  renderReport?: RenderReport;
  finalReviewArtifact?: FinalReview;
  videoAnalysisBrief?: VideoAnalysisBrief;
  expectedResolution?: { width: number; height: number };
  availableRuntimes?: RenderRuntime[];
  motionRequired?: boolean;
  pipelineSlug?: string;
  estimatedCostUsd?: number;
  estimatedTimeMinutes?: number;
  referenceDriven?: boolean;
  heroScenePresent?: boolean;
  checkpoint?: Checkpoint;
  getAgentSkills?: (toolName: string) => readonly string[] | undefined;
};

export function runReview(stageSlug: string, artifact: unknown, ctx: ReviewContext): Review {
  const round = ctx.round ?? 0;
  const stage = ctx.pipeline.stages.find((candidate) => candidate.slug === stageSlug);
  const schemaSlug = stage?.produces ?? stageSlug;
  const rawFindings: Finding[] = [];

  if (stage === undefined) {
    rawFindings.push({
      severity: "critical",
      title: `Stage '${stageSlug}' is missing from pipeline manifest`,
      location: `pipeline.stages.${stageSlug}`,
      description: `Cannot load review_focus or success_criteria for stage '${stageSlug}'.`,
      proposed_fix: `Add a "${stageSlug}" stage with review_focus and success_criteria to pipeline.stages before review round 1.`,
      status: "pending",
    });
  }

  rawFindings.push(...validateArtifactAgainstSchema(schemaSlug, artifact));

  const reviewFocus = stage?.review_focus ?? [];
  rawFindings.push(
    ...reviewFocus.flatMap((item) =>
      evaluateFocusItem(item, stageSlug, artifact, { focusEvaluators: ctx.focusEvaluators }),
    ),
  );

  if (ctx.playbook !== undefined) {
    rawFindings.push(...crossCheckAgainstPlaybook(stageSlug, artifact, ctx.playbook));
  }

  if (ctx.decisionLog !== undefined) {
    rawFindings.push(
      ...auditRequiredCategories(stageSlug, ctx.decisionLog, {
        audioLed: ctx.audioLed,
        narrationInScope: ctx.narrationInScope ?? ctx.narrationRequired,
        deviatesFromScenePlan: ctx.deviatesFromScenePlan,
        substituted: ctx.substituted,
        capabilities: ctx.decisionCapabilities,
        providersWithMultipleModels: ctx.providersWithMultipleModels,
      }),
      ...auditConfidence(ctx.decisionLog),
      ...auditBoilerplateReason(ctx.decisionLog),
    );
  }

  rawFindings.push(
    ...checkReferenceAlignment(stageSlug, artifact, {
      brief: ctx.referenceBrief,
      costLog: ctx.costLog,
      approvedProposalAssets: ctx.approvedProposalAssets,
      decisionLog: ctx.decisionLog,
    }),
  );
  rawFindings.push(
    ...checkCreativeDifferentiation(stageSlug, artifact, {
      scenes: ctx.scenes,
      proposal: ctx.proposalPacket,
      editDecisions: ctx.editDecisions,
      renderReport: ctx.renderReport,
      playbook: ctx.playbook,
      decisionLog: ctx.decisionLog,
      availableRuntimes: ctx.availableRuntimes,
      motionRequired: ctx.motionRequired,
    }),
  );
  rawFindings.push(
    ...checkSourceMediaEnforcement(stageSlug, artifact, {
      sourceMediaReview: ctx.sourceMediaReview,
      userSuppliedMedia: ctx.userSuppliedMedia,
    }),
  );
  rawFindings.push(
    ...checkDeliveryPromise(stageSlug, artifact, {
      deliveryPromise: ctx.deliveryPromise,
      brief: ctx.brief,
      assets: ctx.assets,
      narrationRequired: ctx.narrationRequired,
      narrationPresent: ctx.narrationPresent,
      approvedFallback: ctx.approvedFallback,
    }),
  );
  rawFindings.push(
    ...checkSampleFirstProtocol(stageSlug, artifact, {
      pipelineSlug: ctx.pipelineSlug,
      estimatedCostUsd: ctx.estimatedCostUsd,
      estimatedTimeMinutes: ctx.estimatedTimeMinutes,
      referenceDriven: ctx.referenceDriven,
      motionRequired: ctx.motionRequired,
      heroScenePresent: ctx.heroScenePresent,
      decisionLog: ctx.decisionLog,
    }),
  );
  rawFindings.push(
    ...checkFinalReview(stageSlug, artifact, {
      deliveryPromise: ctx.deliveryPromise,
      proposalPacket: ctx.proposalPacket,
      editDecisions: ctx.editDecisions,
      renderReport: ctx.renderReport,
      finalReviewArtifact: ctx.finalReviewArtifact,
      videoAnalysisBrief: ctx.videoAnalysisBrief ?? ctx.referenceBrief,
      decisionLog: ctx.decisionLog,
      narrationRequired: ctx.narrationRequired,
      expectedResolution: ctx.expectedResolution,
    }),
  );
  rawFindings.push(
    ...checkRuntimeSwap(stageSlug, artifact, {
      proposalPacket: ctx.proposalPacket,
      renderReport: ctx.renderReport,
      decisionLog: ctx.decisionLog,
    }),
  );
  if (ctx.checkpoint !== undefined && ctx.getAgentSkills !== undefined) {
    rawFindings.push(
      ...checkSkillCompliance(stageSlug, ctx.checkpoint, {
        getAgentSkills: ctx.getAgentSkills,
      }),
    );
  }
  if (ctx.plannedDurationS !== undefined && isCompositionStage(stageSlug) && hasCuts(artifact)) {
    rawFindings.push(...validateComposition(artifact, ctx.plannedDurationS));
  }

  const successCriteria = evaluateSuccessCriteria(stage?.success_criteria ?? [], artifact, stageSlug);
  rawFindings.push(...successCriteria.findings);

  const locatedFindings = rawFindings.map((finding) => ensureFindingDefaults(finding, stageSlug));
  const chaiResult = enforceCHAI(locatedFindings);
  ctx.events?.push(...chaiResult.events);

  const findingsWithPatternMatches = appendSameClassFindings(chaiResult.findings, artifact);
  const findings = dedupeFindings(findingsWithPatternMatches).map((finding) => ensureFindingDefaults(finding, stageSlug));
  const summary = summarizeFindings(findings, successCriteria.met, successCriteria.total);
  const decision = summary.critical === 0 ? "pass" : round >= 2 ? "pass_with_warnings" : "revise";

  return ReviewSchema.parse({
    stage: stageSlug,
    round,
    decision,
    findings,
    summary,
  });
}

function appendSameClassFindings(findings: Finding[], artifact: unknown): Finding[] {
  const sameClassFindings = findings
    .filter((finding) => finding.severity === "critical")
    .flatMap((finding) => findSameClassInstances(finding, artifact));

  return [...findings, ...sameClassFindings];
}

function summarizeFindings(findings: Finding[], successCriteriaMet: number, successCriteriaTotal: number): Review["summary"] {
  return {
    critical: findings.filter((finding) => finding.severity === "critical").length,
    suggestions: findings.filter((finding) => finding.severity === "suggestion").length,
    nitpicks: findings.filter((finding) => finding.severity === "nitpick").length,
    investigations: findings.filter((finding) => finding.severity === "investigation").length,
    success_criteria_met: successCriteriaMet,
    success_criteria_total: successCriteriaTotal,
  };
}

function ensureFindingDefaults(finding: Finding, fallbackLocation: string): Finding {
  return {
    ...finding,
    location: finding.location.length > 0 ? finding.location : fallbackLocation,
    status: finding.status ?? "pending",
  };
}

function dedupeFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();

  return findings.filter((finding) => {
    const key = `${finding.severity}:${finding.title}:${finding.location}:${finding.description}`;
    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function isCompositionStage(stageSlug: string): boolean {
  return stageSlug === "edit" || stageSlug === "compose" || stageSlug === "edit_decisions";
}

function hasCuts(value: unknown): value is { cuts: never[] } {
  return isRecord(value) && Array.isArray(value.cuts);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
