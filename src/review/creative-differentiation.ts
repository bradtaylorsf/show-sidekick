import type { DecisionEntry, DecisionLog } from "../artifacts/decision-log.js";
import type { EditDecisions } from "../artifacts/edit-decisions.js";
import type { RenderRuntime } from "../artifacts/enums.js";
import type { ProposalPacket } from "../artifacts/proposal-packet.js";
import type { RenderReport } from "../artifacts/render-report.js";
import type { Finding } from "../artifacts/review.js";
import type { Playbook } from "../shows/playbook.js";
import { checkSceneVariation } from "./scene-variation.js";

type UnknownRecord = Record<string, unknown>;

export type CreativeDifferentiationContext = {
  scenes?: UnknownRecord[];
  proposal?: ProposalPacket;
  editDecisions?: EditDecisions;
  renderReport?: RenderReport;
  playbook?: Playbook;
  decisionLog?: DecisionLog;
  availableRuntimes?: RenderRuntime[];
  motionRequired?: boolean;
};

const SHOT_LANGUAGE_HERO_FIELDS = [
  "shot_size",
  "camera_movement",
  "lighting_key",
  "lens_mm",
  "depth_of_field",
  "color_temperature",
] as const;

const RUNTIME_LABELS = ["ffmpeg", "remotion", "hyperframes"] as const;

export function checkCreativeDifferentiation(
  stageSlug: string,
  artifact: unknown,
  ctx: CreativeDifferentiationContext,
): Finding[] {
  const proposal = ctx.proposal ?? proposalFromArtifact(stageSlug, artifact);
  const editDecisions = ctx.editDecisions ?? editDecisionsFromArtifact(stageSlug, artifact);
  const renderReport = ctx.renderReport ?? renderReportFromArtifact(stageSlug, artifact);
  const scenes = ctx.scenes ?? scenesFromArtifact(artifact);

  return [
    ...checkVariationScore(stageSlug, scenes),
    ...checkPlaybookAlignment(proposal, ctx.playbook),
    ...checkShotLanguageCompleteness(stageSlug, scenes),
    ...checkRendererFamilyMatch(stageSlug, proposal, editDecisions, ctx.decisionLog),
    ...checkRenderRuntimeMatch(stageSlug, proposal, editDecisions, renderReport, ctx.decisionLog),
    ...checkRuntimeSelectionOptions(stageSlug, ctx.decisionLog, ctx.availableRuntimes, ctx.motionRequired),
  ];
}

function checkVariationScore(stageSlug: string, scenes: UnknownRecord[] | undefined): Finding[] {
  if (!isSceneReviewStage(stageSlug) || scenes === undefined || scenes.length === 0) {
    return [];
  }

  const variation = checkSceneVariation(scenes);
  const qualityScore = Number((5 - variation.score).toFixed(2));
  if (qualityScore > 3) {
    return [];
  }

  const severity = qualityScore <= 2 ? "critical" : "suggestion";
  const description = `Scene variation score is ${qualityScore.toFixed(2)}; V-7 requires a score above 3.00 to pass without a finding.`;
  if (severity === "critical") {
    return [
      {
        severity,
        title: "Variation score is below creative differentiation threshold",
        location: `${stageSlug}.scenes`,
        description,
        proposed_fix: `Revise ${stageSlug}.scenes so variation score rises above 3.00; current score is ${qualityScore.toFixed(2)} from ${variation.violations.length} V-6 violation(s).`,
        status: "pending",
      },
    ];
  }

  return [
    {
      severity,
      title: "Variation score is below creative differentiation threshold",
      location: `${stageSlug}.scenes`,
      description,
      proposed_change: `Add stronger shot, motion, lighting, texture, and intent variety until the variation score is above 3.00.`,
      status: "pending",
    },
  ];
}

function checkPlaybookAlignment(proposal: ProposalPacket | undefined, playbook: Playbook | undefined): Finding[] {
  if (proposal?.production_plan.renderer_family !== "cinematic-trailer" || playbook === undefined) {
    return [];
  }

  if (!isCleanProfessionalPlaybook(playbook)) {
    return [];
  }

  return [
    {
      severity: "suggestion",
      title: "Cinematic trailer renderer family conflicts with clean-professional playbook",
      location: "proposal.production_plan.renderer_family",
      description: 'The proposal selects renderer_family "cinematic-trailer" while the active playbook is clean-professional.',
      proposed_change: 'Choose a more restrained renderer family such as "explainer-data", or select a trailer-oriented playbook before scene planning.',
      status: "pending",
    },
  ];
}

function checkShotLanguageCompleteness(stageSlug: string, scenes: UnknownRecord[] | undefined): Finding[] {
  if (!isSceneReviewStage(stageSlug) || scenes === undefined) {
    return [];
  }

  return scenes.flatMap((scene, index) => [
    ...checkSceneShotLanguageBasics(stageSlug, scene, index),
    ...checkHeroShotLanguage(stageSlug, scene, index),
  ]);
}

function checkSceneShotLanguageBasics(stageSlug: string, scene: UnknownRecord, index: number): Finding[] {
  const missing = ["shot_size", "shot_intent"].filter((field) => !hasShotLanguageValue(scene, field));
  if (missing.length === 0) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Scene shot language is incomplete",
      location: `${stageSlug}.scenes[${index}]`,
      description: `Scene ${index} is missing required creative differentiation field(s): ${missing.join(", ")}.`,
      proposed_fix: `Populate ${stageSlug}.scenes[${index}] with non-empty "${missing.join('", "')}" values before review round 1 continues.`,
      status: "pending",
    },
  ];
}

function checkHeroShotLanguage(stageSlug: string, scene: UnknownRecord, index: number): Finding[] {
  if (scene.hero_moment !== true) {
    return [];
  }

  const missing = SHOT_LANGUAGE_HERO_FIELDS.filter((field) => !hasShotLanguageValue(scene, field));
  if (missing.length === 0) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Hero moment shot language is incomplete",
      location: `${stageSlug}.scenes[${index}].shot_language`,
      description: `Hero scene ${index} is missing full shot_language field(s): ${missing.join(", ")}.`,
      proposed_fix: `Populate hero scene ${index} shot_language with "${missing.join('", "')}" before review round 1; hero moments require all 6 fields.`,
      status: "pending",
    },
  ];
}

function checkRendererFamilyMatch(
  stageSlug: string,
  proposal: ProposalPacket | undefined,
  editDecisions: EditDecisions | undefined,
  decisionLog: DecisionLog | undefined,
): Finding[] {
  if (!isEditStage(stageSlug) || proposal === undefined || editDecisions === undefined) {
    return [];
  }

  const proposed = proposal.production_plan.renderer_family;
  const actual = editDecisions.renderer_family;
  if (actual === proposed || hasLoggedSelection(decisionLog, "renderer_family_selection", actual, "edit")) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Renderer family changed without a decision log entry",
      location: "edit_decisions.renderer_family",
      description: `Edit decisions use renderer_family "${actual}", but the proposal locked "${proposed}".`,
      proposed_fix: `Set edit_decisions.renderer_family back to "${proposed}" or add an edit-stage renderer_family_selection decision that picks "${actual}".`,
      patch: {
        artifact_path: "edit_decisions.renderer_family",
        new_value: proposed,
      },
      status: "pending",
    },
  ];
}

function checkRenderRuntimeMatch(
  stageSlug: string,
  proposal: ProposalPacket | undefined,
  editDecisions: EditDecisions | undefined,
  renderReport: RenderReport | undefined,
  decisionLog: DecisionLog | undefined,
): Finding[] {
  if (proposal === undefined) {
    return [];
  }

  const proposed = proposal.production_plan.render_runtime;
  if (isEditStage(stageSlug) && editDecisions !== undefined) {
    return runtimeMismatchFinding({
      actual: editDecisions.render_runtime,
      proposed,
      location: "edit_decisions.render_runtime",
      decisionLog,
    });
  }

  if (isComposeStage(stageSlug) && renderReport !== undefined) {
    return runtimeMismatchFinding({
      actual: renderReport.runtime_used,
      proposed,
      location: "render_report.runtime_used",
      decisionLog,
    });
  }

  return [];
}

function runtimeMismatchFinding(opts: {
  actual: RenderRuntime;
  proposed: RenderRuntime;
  location: string;
  decisionLog: DecisionLog | undefined;
}): Finding[] {
  if (opts.actual === opts.proposed || hasLoggedSelection(opts.decisionLog, "render_runtime_selection", opts.actual, "edit")) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Render runtime changed without a decision log entry",
      location: opts.location,
      description: `${opts.location} is "${opts.actual}", but the proposal locked render_runtime "${opts.proposed}".`,
      proposed_fix: `Set ${opts.location} back to "${opts.proposed}" or add an edit-stage render_runtime_selection decision that picks "${opts.actual}".`,
      patch: {
        artifact_path: opts.location,
        new_value: opts.proposed,
      },
      status: "pending",
    },
  ];
}

function checkRuntimeSelectionOptions(
  stageSlug: string,
  decisionLog: DecisionLog | undefined,
  availableRuntimes: RenderRuntime[] | undefined,
  motionRequired: boolean | undefined,
): Finding[] {
  if (!isProposalStage(stageSlug)) {
    return [];
  }

  const requiredRuntimes = requiredRuntimeOptions(decisionLog, availableRuntimes, motionRequired);
  if (requiredRuntimes.length <= 1) {
    return [];
  }

  const runtimeDecision = latestActiveDecision(decisionLog, "render_runtime_selection");
  if (runtimeDecision === undefined) {
    return [
      {
        severity: "critical",
        title: "Runtime selection omitted available options",
        location: "decision_log.render_runtime_selection",
        description: `No active render_runtime_selection decision lists required runtime option(s): ${requiredRuntimes.join(", ")}.`,
        proposed_fix: `Add a proposal-stage render_runtime_selection decision with options_considered labels "${requiredRuntimes.join('", "')}" before review round 1.`,
        status: "pending",
      },
    ];
  }

  const presented = new Set(runtimeDecision.options_considered.map((option) => normalizeRuntimeLabel(option.label)));
  const missing = requiredRuntimes.filter((runtime) => !presented.has(runtime));
  if (missing.length === 0) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Runtime selection omitted available options",
      location: `decision_log.${runtimeDecision.id}.options_considered`,
      description: `The render_runtime_selection decision did not present available option(s): ${missing.join(", ")}.`,
      proposed_fix: `Add option label(s) "${missing.join('", "')}" to ${runtimeDecision.id}.options_considered so Remotion, HyperFrames, and applicable DEC-4 ffmpeg choices are visible.`,
      status: "pending",
    },
  ];
}

function requiredRuntimeOptions(
  decisionLog: DecisionLog | undefined,
  availableRuntimes: RenderRuntime[] | undefined,
  motionRequired: boolean | undefined,
): RenderRuntime[] {
  const available = new Set(availableRuntimes ?? inferAvailableRuntimes(decisionLog));
  const required: RenderRuntime[] = [];

  if (available.has("remotion") && available.has("hyperframes")) {
    required.push("remotion", "hyperframes");
  }

  if (motionRequired === false && available.has("ffmpeg")) {
    required.push("ffmpeg");
  }

  return [...new Set(required)];
}

function hasLoggedSelection(
  decisionLog: DecisionLog | undefined,
  category: DecisionEntry["category"],
  picked: string,
  minStage: string,
): boolean {
  return activeDecisions(decisionLog).some((decision) => {
    return decision.category === category && decision.picked === picked && isStageAtOrAfter(decision.stage, minStage);
  });
}

function latestActiveDecision(decisionLog: DecisionLog | undefined, category: DecisionEntry["category"]): DecisionEntry | undefined {
  return activeDecisions(decisionLog)
    .filter((decision) => decision.category === category)
    .at(-1);
}

function activeDecisions(decisionLog: DecisionLog | undefined): DecisionEntry[] {
  const supersededIds = new Set((decisionLog ?? []).map((decision) => decision.supersedes).filter(isString));
  return (decisionLog ?? []).filter((decision) => !supersededIds.has(decision.id));
}

function inferAvailableRuntimes(decisionLog: DecisionLog | undefined): RenderRuntime[] {
  const runtimes = new Set<RenderRuntime>();
  (decisionLog ?? [])
    .filter((decision) => decision.category === "render_runtime_selection")
    .forEach((decision) => {
      const picked = normalizeRuntimeLabel(decision.picked);
      if (isRenderRuntime(picked)) {
        runtimes.add(picked);
      }

      decision.options_considered.forEach((option) => {
        const label = normalizeRuntimeLabel(option.label);
        if (isRenderRuntime(label)) {
          runtimes.add(label);
        }
      });
    });

  return [...runtimes];
}

function isCleanProfessionalPlaybook(playbook: Playbook): boolean {
  const record = playbook as UnknownRecord;
  const qualityRules = isRecord(record.quality_rules) ? record.quality_rules : {};
  const markerFields = ["slug", "name", "id", "style", "playbook", "playbook_slug"];

  return markerFields.some((field) => isCleanProfessionalMarker(record[field]) || isCleanProfessionalMarker(qualityRules[field]));
}

function isCleanProfessionalMarker(value: unknown): boolean {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase().replace(/_/g, "-");
  return normalized === "clean-professional" || normalized === "clean professional";
}

function hasShotLanguageValue(scene: UnknownRecord, field: string): boolean {
  const shotLanguage = isRecord(scene.shot_language) ? scene.shot_language : {};
  const value = shotLanguage[field] ?? scene[field];
  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  return typeof value === "number" && Number.isFinite(value);
}

function scenesFromArtifact(artifact: unknown): UnknownRecord[] | undefined {
  if (!isRecord(artifact) || !Array.isArray(artifact.scenes)) {
    return undefined;
  }

  return artifact.scenes.filter(isRecord);
}

function proposalFromArtifact(stageSlug: string, artifact: unknown): ProposalPacket | undefined {
  if (!isProposalStage(stageSlug) || !isRecord(artifact) || !isRecord(artifact.production_plan)) {
    return undefined;
  }

  return artifact as ProposalPacket;
}

function editDecisionsFromArtifact(stageSlug: string, artifact: unknown): EditDecisions | undefined {
  if (!isEditStage(stageSlug) || !isRecord(artifact) || typeof artifact.render_runtime !== "string") {
    return undefined;
  }

  return artifact as EditDecisions;
}

function renderReportFromArtifact(stageSlug: string, artifact: unknown): RenderReport | undefined {
  if (!isComposeStage(stageSlug) || !isRecord(artifact) || typeof artifact.runtime_used !== "string") {
    return undefined;
  }

  return artifact as RenderReport;
}

function normalizeRuntimeLabel(label: string): string {
  return label.trim().toLowerCase();
}

function isRenderRuntime(value: string): value is RenderRuntime {
  return RUNTIME_LABELS.some((runtime) => runtime === value);
}

function isProposalStage(stageSlug: string): boolean {
  return normalizeStage(stageSlug) === "proposal";
}

function isSceneReviewStage(stageSlug: string): boolean {
  const stage = normalizeStage(stageSlug);
  return stage === "scene_plan" || stage === "edit";
}

function isEditStage(stageSlug: string): boolean {
  return normalizeStage(stageSlug) === "edit";
}

function isComposeStage(stageSlug: string): boolean {
  return normalizeStage(stageSlug) === "compose";
}

function isStageAtOrAfter(stageSlug: string, minStageSlug: string): boolean {
  const order = ["proposal", "script", "cuesheet", "scene_plan", "assets", "edit", "compose", "publish"];
  const stageIndex = order.indexOf(normalizeStage(stageSlug));
  const minStageIndex = order.indexOf(normalizeStage(minStageSlug));
  if (stageIndex === -1 || minStageIndex === -1) {
    return stageSlug === minStageSlug;
  }

  return stageIndex >= minStageIndex;
}

function normalizeStage(stageSlug: string): string {
  if (stageSlug === "proposal_packet") {
    return "proposal";
  }
  if (stageSlug === "edit_decisions") {
    return "edit";
  }
  if (stageSlug === "render_report") {
    return "compose";
  }

  return stageSlug;
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
