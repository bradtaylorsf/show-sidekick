import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DecisionEntrySchema, type DecisionEntry, type DecisionLog } from "../artifacts/decision-log.js";
import { RenderRuntimeSchema, type RenderRuntime } from "../artifacts/enums.js";
import { FinalReviewSchema, FINAL_REVIEW_THRESHOLDS, type FinalReview } from "../artifacts/final-review.js";
import type { EditDecisions } from "../artifacts/edit-decisions.js";
import type { ProposalPacket } from "../artifacts/proposal-packet.js";
import type { RenderReport } from "../artifacts/render-report.js";
import type { Finding } from "../artifacts/review.js";
import type { VideoAnalysisBrief } from "../artifacts/video-analysis-brief.js";
import { PROMISE_RULES, type DeliveryPromise } from "./delivery-promise.js";

export const FINAL_REVIEW_FRAMES_RELATIVE_DIR = path.join("final_review", "frames");
export const FINAL_FAILED_RENDER_RELATIVE_PATH = path.join("renders", "final-failed.mp4");

export type FinalReviewContext = {
  deliveryPromise?: DeliveryPromise;
  proposalPacket?: ProposalPacket;
  editDecisions?: EditDecisions;
  renderReport?: RenderReport;
  decisionLog?: DecisionLog;
  videoAnalysisBrief?: VideoAnalysisBrief;
  narrationRequired?: boolean;
  expectedResolution?: { width: number; height: number };
  finalReviewArtifact?: FinalReview;
  heroScenePresent?: boolean;
  show?: string;
  episode?: string;
  projectRoot?: string;
};

export type BuildFinalReviewInput = FinalReviewContext & {
  technical_probe: FinalReview["checks"]["technical_probe"];
  visual_spotcheck: FinalReview["checks"]["visual_spotcheck"];
  audio_spotcheck: FinalReview["checks"]["audio_spotcheck"];
  subtitle_check: FinalReview["checks"]["subtitle_check"];
  transcript_comparison?: FinalReview["checks"]["transcript_comparison"];
  motion_ratio_actual: number;
  render_runtime_used?: RenderRuntime;
};

type RuntimeSwapResult = {
  detected: boolean;
  allowed: boolean;
  check: string;
};

type FinalReviewEvaluation = {
  findings: Finding[];
  silentDowngradeDetected: boolean;
  runtimeSwapDetected: boolean;
  runtimeSwapAllowed: boolean;
  runtimeSwapCheck: string;
};

export function buildFinalReview(input: BuildFinalReviewInput): FinalReview {
  const renderRuntimeUsed = input.render_runtime_used ?? input.renderReport?.runtime_used ?? input.proposalPacket?.production_plan.render_runtime;

  const draft = FinalReviewSchema.parse({
    status: "pass",
    recommended_action: "present_to_user",
    checks: {
      technical_probe: input.technical_probe,
      visual_spotcheck: input.visual_spotcheck,
      audio_spotcheck: input.audio_spotcheck,
      promise_preservation: {
        delivery_promise_honored: true,
        silent_downgrade_detected: false,
        runtime_swap_detected: false,
        runtime_swap_check: "not checked",
        motion_ratio_actual: input.motion_ratio_actual,
        render_runtime_used: RenderRuntimeSchema.parse(renderRuntimeUsed),
        findings: [],
      },
      subtitle_check: input.subtitle_check,
      transcript_comparison: input.transcript_comparison,
    },
    issues_found: [],
  });

  const evaluation = evaluateFinalReview(draft, input);
  const status = statusFromFindings(evaluation.findings, evaluation);
  const promiseFindings = evaluation.findings
    .filter((finding) => finding.location.startsWith("final_review.checks.promise_preservation"))
    .map((finding) => finding.description);

  return FinalReviewSchema.parse({
    ...draft,
    status,
    recommended_action: recommendedActionForStatus(status),
    checks: {
      ...draft.checks,
      promise_preservation: {
        ...draft.checks.promise_preservation,
        delivery_promise_honored: !evaluation.silentDowngradeDetected,
        silent_downgrade_detected: evaluation.silentDowngradeDetected,
        runtime_swap_detected: evaluation.runtimeSwapDetected,
        runtime_swap_check: evaluation.runtimeSwapCheck,
        findings: promiseFindings,
      },
    },
    issues_found: evaluation.findings,
  });
}

export function checkFinalReview(stageSlug: string, artifact: unknown, ctx: FinalReviewContext = {}): Finding[] {
  if (!isFinalReviewStage(stageSlug)) {
    return [];
  }

  const candidate = ctx.finalReviewArtifact ?? artifact;
  const parsed = FinalReviewSchema.safeParse(candidate);
  if (!parsed.success) {
    return [];
  }

  const evaluation = evaluateFinalReview(parsed.data, ctx);
  const findings = [...evaluation.findings];
  const computedStatus = statusFromFindings(findings, evaluation);

  if (parsed.data.status === "fail" && computedStatus !== "fail") {
    findings.push({
      severity: "critical",
      title: "Final review is marked failed",
      location: "final_review.status",
      description: "The final_review artifact status is fail, so the compose pipeline must halt before presenting output.",
      proposed_fix:
        "Preserve the failed render, address the final_review issues, or record a downgrade_approval force approval before proceeding.",
      status: "pending",
    });
  }

  if (parsed.data.status !== computedStatus) {
    const severity = computedStatus === "fail" ? "critical" : "suggestion";
    findings.push({
      severity,
      title: "Final review status does not match computed outcome",
      location: "final_review.status",
      description: `final_review.status is "${parsed.data.status}", but the computed outcome from V-9 checks is "${computedStatus}".`,
      proposed_fix: `Set final_review.status to "${computedStatus}" and recommended_action to "${recommendedActionForStatus(
        computedStatus,
      )}".`,
      patch: {
        artifact_path: "final_review.status",
        new_value: computedStatus,
      },
      status: "pending",
    });
  }

  return findings;
}

export function finalReviewFramesDir(show: string, episode: string, root: string = process.cwd()): string {
  return path.join(root, "projects", show, episode, FINAL_REVIEW_FRAMES_RELATIVE_DIR);
}

export function finalFailedRenderPath(show: string, episode: string, root: string = process.cwd()): string {
  return path.join(root, "projects", show, episode, FINAL_FAILED_RENDER_RELATIVE_PATH);
}

export function haltOnFinalReviewFail(
  finalReview: Pick<FinalReview, "status">,
  target: { show: string; episode: string; root?: string; renderPath?: string },
): { halt: boolean; preservedPath: string } {
  const halt = finalReview.status === "fail";
  const preservedPath = finalFailedRenderPath(target.show, target.episode, target.root);

  if (halt && target.renderPath !== undefined) {
    mkdirSync(path.dirname(preservedPath), { recursive: true });
    copyFileSync(target.renderPath, preservedPath);
  }

  return {
    halt,
    preservedPath,
  };
}

export function buildForceApprovalDecision(input: {
  reason: string;
  timestamp: string;
  id?: string;
  confidence?: number;
  stage?: string;
  supersedes?: string | null;
}): DecisionEntry {
  const stableTimestamp = input.timestamp.replace(/[^0-9A-Za-z]+/gu, "-").replace(/^-|-$/gu, "");

  return DecisionEntrySchema.parse({
    id: input.id ?? `force_approval-${stableTimestamp}`,
    stage: input.stage ?? "compose",
    timestamp: input.timestamp,
    category: "downgrade_approval",
    options_considered: [
      {
        label: "halt_and_revise",
        rejected_because: "user chose to force approve the failed final review",
        notes: "Default V-9 outcome is to halt on final_review.status=fail.",
      },
      {
        label: "force_approval",
        rejected_because: null,
        notes: "User explicitly approved proceeding despite the downgrade or final-review failure.",
      },
    ],
    picked: "force_approval",
    reason: input.reason,
    confidence: input.confidence ?? 0.75,
    user_visible: true,
    supersedes: input.supersedes ?? null,
  });
}

function evaluateFinalReview(finalReview: FinalReview, ctx: FinalReviewContext): FinalReviewEvaluation {
  const runtime = runtimeSwap(finalReview, ctx);
  const silentDowngradeFindings = [
    ...checkMotionPromise(finalReview, ctx),
    ...checkRuntimeDowngrade(runtime),
    ...checkDroppedNarration(finalReview, ctx),
    ...checkReferenceLovedElements(finalReview, ctx),
  ];
  const existingSilentDowngrade = finalReview.checks.promise_preservation.silent_downgrade_detected;
  const existingRuntimeSwap = finalReview.checks.promise_preservation.runtime_swap_detected;
  const findings = [
    ...checkTechnicalProbe(finalReview, ctx),
    ...checkVisualSpotcheck(finalReview, ctx),
    ...checkAudioSpotcheck(finalReview),
    ...checkSubtitleCheck(finalReview),
    ...checkTranscriptComparison(finalReview),
    ...silentDowngradeFindings,
  ];

  if (existingSilentDowngrade && silentDowngradeFindings.length === 0) {
    findings.push({
      severity: "critical",
      title: "Final review detected a silent downgrade",
      location: "final_review.checks.promise_preservation.silent_downgrade_detected",
      description: "The final_review artifact reports silent_downgrade_detected=true, which is a V-9 halt condition.",
      proposed_fix: "Resolve the downgrade or record a user-visible downgrade_approval decision before proceeding.",
      status: "pending",
    });
  }

  if (existingRuntimeSwap && !runtime.detected) {
    findings.push({
      severity: "critical",
      title: "Final review detected a runtime swap",
      location: "final_review.checks.promise_preservation.runtime_swap_detected",
      description:
        "The final_review artifact reports runtime_swap_detected=true, which is critical unless a superseding render_runtime_selection decision exists.",
      proposed_fix:
        "Add a superseding render_runtime_selection decision or restore the render runtime locked by proposal and edit decisions.",
      status: "pending",
    });
  }

  return {
    findings,
    silentDowngradeDetected: existingSilentDowngrade || silentDowngradeFindings.length > 0,
    runtimeSwapDetected: runtime.detected || existingRuntimeSwap,
    runtimeSwapAllowed: runtime.allowed,
    runtimeSwapCheck: runtime.check,
  };
}

function checkTechnicalProbe(finalReview: FinalReview, ctx: FinalReviewContext): Finding[] {
  const probe = finalReview.checks.technical_probe;
  const findings: Finding[] = [];
  const durationDrift = Math.abs(probe.duration_s - probe.duration_promised_s);
  if (durationDrift > 0.5) {
    findings.push({
      severity: "critical",
      title: "Final render duration is outside tolerance",
      location: "final_review.checks.technical_probe.duration_s",
      description: `ffprobe duration is ${probe.duration_s.toFixed(2)}s, promised duration is ${probe.duration_promised_s.toFixed(
        2,
      )}s, drift is ${durationDrift.toFixed(2)}s.`,
      proposed_fix: "Re-render or adjust the edit so final duration is within +/-0.5s of the promised duration.",
      status: "pending",
    });
  }

  const expectedResolution = ctx.expectedResolution ?? ctx.renderReport?.resolution;
  if (expectedResolution !== undefined && (probe.width !== expectedResolution.width || probe.height !== expectedResolution.height)) {
    findings.push({
      severity: "critical",
      title: "Final render resolution does not match plan",
      location: "final_review.checks.technical_probe",
      description: `ffprobe resolution is ${probe.width}x${probe.height}, expected ${expectedResolution.width}x${expectedResolution.height}.`,
      proposed_fix: `Re-render at exactly ${expectedResolution.width}x${expectedResolution.height} or update the approved plan before compose review.`,
      status: "pending",
    });
  }

  if (probe.verdict === "fail" || !isValidContainer(probe.container)) {
    findings.push({
      severity: "critical",
      title: "Final render container is invalid",
      location: "final_review.checks.technical_probe.container",
      description: `ffprobe container "${probe.container}" with verdict "${probe.verdict}" is not a valid final render container.`,
      proposed_fix: "Regenerate the final render with a valid playable container before presenting it to the user.",
      status: "pending",
    });
  }

  if (!isReasonableVideoCodec(probe.video_codec) || !isReasonableAudioCodec(probe.audio_codec)) {
    findings.push({
      severity: "critical",
      title: "Final render codecs are not reasonable",
      location: "final_review.checks.technical_probe",
      description: `ffprobe reported video codec "${probe.video_codec}" and audio codec "${probe.audio_codec}", which do not meet the V-9 reasonable-codec check.`,
      proposed_fix:
        "Encode with a standard delivery codec such as h264/aac, h265/aac, vp9/opus, av1/opus, or ProRes with PCM audio.",
      status: "pending",
    });
  }

  return findings;
}

function checkVisualSpotcheck(finalReview: FinalReview, ctx: FinalReviewContext): Finding[] {
  const visual = finalReview.checks.visual_spotcheck;
  const findings: Finding[] = [];

  if (visual.frames_sampled < FINAL_REVIEW_THRESHOLDS.visual_frames_sampled_min) {
    findings.push({
      severity: "critical",
      title: "Final review sampled too few frames",
      location: "final_review.checks.visual_spotcheck.frames_sampled",
      description: `V-9 requires at least ${FINAL_REVIEW_THRESHOLDS.visual_frames_sampled_min} sampled frames at 10/35/65/90% plus a hero frame when applicable; final_review sampled ${visual.frames_sampled}.`,
      proposed_fix:
        "Sample and save at least four distributed frames under projects/<show>/<episode>/final_review/frames/ before final review passes.",
      status: "pending",
    });
  }

  if (!hasDistributedSamplePoints(visual.sample_points_pct)) {
    findings.push({
      severity: "critical",
      title: "Final review sample points are not distributed across the timeline",
      location: "final_review.checks.visual_spotcheck.sample_points_pct",
      description: `V-9 requires visual sample points near 10/35/65/90%, but final_review recorded ${JSON.stringify(visual.sample_points_pct ?? [])}.`,
      proposed_fix:
        "Set final_review.checks.visual_spotcheck.sample_points_pct to four frame samples near 10, 35, 65, and 90 percent.",
      status: "pending",
    });
  }

  if (ctx.heroScenePresent === true && emptyString(visual.hero_frame_path)) {
    findings.push({
      severity: "critical",
      title: "Final review is missing the hero scene frame",
      location: "final_review.checks.visual_spotcheck.hero_frame_path",
      description: "A hero scene is present, but final_review did not record a hero_frame_path.",
      proposed_fix:
        "Save a hero-scene frame under projects/<show>/<episode>/final_review/frames/hero.png and set final_review.checks.visual_spotcheck.hero_frame_path.",
      status: "pending",
    });
  }

  findings.push(...checkFramePaths(visual.frame_paths ?? [], ctx, "frame_paths"));
  const heroFramePath = visual.hero_frame_path;
  if (heroFramePath !== undefined && heroFramePath.trim().length > 0) {
    findings.push(...checkFramePaths([heroFramePath], ctx, "hero_frame_path"));
  }

  return findings;
}

function checkAudioSpotcheck(finalReview: FinalReview): Finding[] {
  const accuracy = finalReview.checks.audio_spotcheck.caption_sync_accuracy;
  if (accuracy >= FINAL_REVIEW_THRESHOLDS.caption_sync_accuracy_pass) {
    return [];
  }

  return [
    {
      severity: accuracy < FINAL_REVIEW_THRESHOLDS.caption_sync_accuracy_critical_below ? "critical" : "suggestion",
      title: "Caption sync accuracy is below V-9 threshold",
      location: "final_review.checks.audio_spotcheck.caption_sync_accuracy",
      description: `caption_sync_accuracy is ${accuracy.toFixed(2)}; V-9 expects >= ${FINAL_REVIEW_THRESHOLDS.caption_sync_accuracy_pass.toFixed(
        2,
      )} and treats < ${FINAL_REVIEW_THRESHOLDS.caption_sync_accuracy_critical_below.toFixed(2)} as critical.`,
      proposed_fix: "Regenerate or retime captions so at least 95% of words are within +/-150ms of transcript timestamps.",
      status: "pending",
    },
  ];
}

function checkSubtitleCheck(finalReview: FinalReview): Finding[] {
  const accuracy = finalReview.checks.subtitle_check.accuracy_within_150ms;
  if (accuracy >= FINAL_REVIEW_THRESHOLDS.subtitle_accuracy_pass) {
    return [];
  }

  return [
    {
      severity: accuracy < FINAL_REVIEW_THRESHOLDS.subtitle_accuracy_critical_below ? "critical" : "suggestion",
      title: "Subtitle timing accuracy is below V-9 threshold",
      location: "final_review.checks.subtitle_check.accuracy_within_150ms",
      description: `subtitle_check.accuracy_within_150ms is ${accuracy.toFixed(
        2,
      )}; V-9 expects >= ${FINAL_REVIEW_THRESHOLDS.subtitle_accuracy_pass.toFixed(2)} and treats < ${FINAL_REVIEW_THRESHOLDS.subtitle_accuracy_critical_below.toFixed(
        2,
      )} as critical.`,
      proposed_fix: "Retime subtitles so at least 95% of words are within +/-150ms of transcript timestamps.",
      status: "pending",
    },
  ];
}

function checkTranscriptComparison(finalReview: FinalReview): Finding[] {
  const comparison = finalReview.checks.transcript_comparison;
  if (comparison === undefined || comparison.word_accuracy >= FINAL_REVIEW_THRESHOLDS.word_accuracy_pass) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Transcript comparison indicates audio may be cut off",
      location: "final_review.checks.transcript_comparison.word_accuracy",
      description: `transcript_comparison.word_accuracy is ${comparison.word_accuracy.toFixed(
        2,
      )}; V-9 treats < ${FINAL_REVIEW_THRESHOLDS.word_accuracy_pass.toFixed(2)} as critical when a script artifact exists.`,
      proposed_fix: "Restore or regenerate narration audio so rendered speech matches the script before presenting the final render.",
      status: "pending",
    },
  ];
}

function checkMotionPromise(finalReview: FinalReview, ctx: FinalReviewContext): Finding[] {
  const promise = ctx.deliveryPromise ?? promiseFromProposal(ctx.proposalPacket);
  if (promise === undefined) {
    return [];
  }

  const rule = PROMISE_RULES[promise];
  if (!rule.requires_video_generation || finalReview.checks.promise_preservation.motion_ratio_actual >= rule.min_motion_ratio) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Motion-led promise was silently downgraded",
      location: "final_review.checks.promise_preservation.motion_ratio_actual",
      description: `${promise} requires motion_ratio_actual >= ${rule.min_motion_ratio.toFixed(2)}, but final review measured ${finalReview.checks.promise_preservation.motion_ratio_actual.toFixed(2)}.`,
      proposed_fix: `Re-render with enough motion-led scenes to reach ${rule.min_motion_ratio.toFixed(
        2,
      )} motion ratio or record an explicit downgrade_approval.`,
      status: "pending",
    },
  ];
}

function checkRuntimeDowngrade(runtime: RuntimeSwapResult): Finding[] {
  if (!runtime.detected || runtime.allowed) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Render runtime changed without superseding decision",
      location: "final_review.checks.promise_preservation.render_runtime_used",
      description: runtime.check,
      proposed_fix:
        "Restore the proposal/edit render runtime or add a superseding render_runtime_selection decision before final review passes.",
      status: "pending",
    },
  ];
}

function checkDroppedNarration(finalReview: FinalReview, ctx: FinalReviewContext): Finding[] {
  const narrationRequired = ctx.narrationRequired === true || ctx.proposalPacket?.delivery_promise.narration_present === true;
  if (!narrationRequired || finalReview.checks.audio_spotcheck.narration_present) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Narration-required promise dropped narration",
      location: "final_review.checks.audio_spotcheck.narration_present",
      description: "The proposal or review context requires narration, but final audio_spotcheck reports narration_present=false.",
      proposed_fix: "Restore narration in the final render or record an explicit downgrade_approval before proceeding.",
      status: "pending",
    },
  ];
}

function checkReferenceLovedElements(finalReview: FinalReview, ctx: FinalReviewContext): Finding[] {
  const promisedElements = ctx.videoAnalysisBrief?.promise_elements ?? [];
  if (promisedElements.length === 0) {
    return [];
  }

  const observedElements = new Set((finalReview.checks.visual_spotcheck.matched_elements ?? []).map(normalizeText));
  const findingsText = finalReview.checks.visual_spotcheck.findings.map((finding) => normalizeText(JSON.stringify(finding))).join(" ");
  const missing = promisedElements.filter((element) => {
    const normalized = normalizeText(element);
    return !observedElements.has(normalized) && !findingsText.includes(normalized);
  });

  if (missing.length === 0) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "Reference-loved elements are missing from final render",
      location: "final_review.checks.visual_spotcheck",
      description: `video_analysis_brief.promise_elements includes ${missing.join(
        ", ",
      )}, but final visual spotcheck did not observe those element(s).`,
      proposed_fix: "Restore the missing reference-loved element(s) in the rendered output or record an explicit downgrade_approval.",
      status: "pending",
    },
  ];
}

function runtimeSwap(finalReview: FinalReview, ctx: FinalReviewContext): RuntimeSwapResult {
  const proposalRuntime = ctx.proposalPacket?.production_plan.render_runtime;
  const editRuntime = ctx.editDecisions?.render_runtime;
  const renderRuntime = finalReview.checks.promise_preservation.render_runtime_used;
  const lockExpected =
    ctx.decisionLog !== undefined ||
    ctx.proposalPacket !== undefined ||
    ctx.editDecisions !== undefined ||
    ctx.renderReport !== undefined;

  if (lockExpected && proposalRuntime === undefined && editRuntime === undefined) {
    return {
      detected: true,
      allowed: false,
      check: `missing lock - no proposal or edit render_runtime is available, render=${renderRuntime}`,
    };
  }

  const mismatch =
    (proposalRuntime !== undefined && renderRuntime !== proposalRuntime) ||
    (editRuntime !== undefined && renderRuntime !== editRuntime);
  const allowed = mismatch && hasSupersedingRuntimeDecision(ctx.decisionLog, renderRuntime);
  const label = mismatch && !allowed ? "mismatch" : "ok";
  const suffix = mismatch ? (allowed ? " (superseding decision logged)" : " (no superseding decision)") : "";

  return {
    detected: mismatch,
    allowed,
    check: `${label} - proposal=${proposalRuntime ?? "unknown"}, edit=${editRuntime ?? "unknown"}, render=${renderRuntime}${suffix}`,
  };
}

function hasSupersedingRuntimeDecision(decisionLog: DecisionLog | undefined, picked: RenderRuntime): boolean {
  return activeDecisions(decisionLog).some((decision) => {
    return decision.category === "render_runtime_selection" && decision.picked === picked && typeof decision.supersedes === "string";
  });
}

function activeDecisions(decisionLog: DecisionLog | undefined): DecisionEntry[] {
  const supersededIds = new Set((decisionLog ?? []).map((decision) => decision.supersedes).filter(isString));
  return (decisionLog ?? []).filter((decision) => !supersededIds.has(decision.id));
}

function statusFromFindings(findings: Finding[], evaluation: FinalReviewEvaluation): FinalReview["status"] {
  if (
    findings.some((finding) => finding.severity === "critical") ||
    evaluation.silentDowngradeDetected ||
    (evaluation.runtimeSwapDetected && !evaluation.runtimeSwapAllowed)
  ) {
    return "fail";
  }

  if (findings.some((finding) => finding.severity === "suggestion")) {
    return "revise";
  }

  return "pass";
}

function recommendedActionForStatus(status: FinalReview["status"]): FinalReview["recommended_action"] {
  if (status === "fail") {
    return "block";
  }

  if (status === "revise") {
    return "revise_edit";
  }

  return "present_to_user";
}

function promiseFromProposal(proposalPacket: ProposalPacket | undefined): DeliveryPromise | undefined {
  if (proposalPacket?.delivery_promise.motion_led === true) {
    return "motion_led";
  }

  return undefined;
}

function isFinalReviewStage(stageSlug: string): boolean {
  return stageSlug === "compose" || stageSlug === "final_review";
}

function isValidContainer(container: string): boolean {
  const normalized = normalizeText(container);
  return ["mp4", "mov", "quicktime", "matroska", "webm"].includes(normalized);
}

function isReasonableVideoCodec(codec: string): boolean {
  const normalized = normalizeText(codec);
  return ["h264", "avc1", "h265", "hevc", "vp9", "av1", "prores"].includes(normalized);
}

function isReasonableAudioCodec(codec: string): boolean {
  const normalized = normalizeText(codec);
  return ["aac", "mp3", "opus", "pcm_s16le", "pcm_s24le", "pcm_f32le"].includes(normalized);
}

function hasDistributedSamplePoints(samplePoints: number[] | undefined): boolean {
  const expected = [10, 35, 65, 90];
  const tolerance = 5;

  if (samplePoints === undefined || samplePoints.length < expected.length) {
    return false;
  }

  return expected.every((target) => samplePoints.some((point) => Math.abs(point - target) <= tolerance));
}

function checkFramePaths(paths: string[], ctx: FinalReviewContext, field: "frame_paths" | "hero_frame_path"): Finding[] {
  if (paths.length === 0) {
    return [];
  }

  const { show, episode } = ctx;
  if (show === undefined || episode === undefined) {
    return [];
  }

  const root = path.resolve(ctx.projectRoot ?? process.cwd());
  const framesDir = finalReviewFramesDir(show, episode, root);

  return paths.flatMap((framePath, index) => {
    const absolutePath = path.isAbsolute(framePath) ? framePath : path.resolve(root, framePath);
    const location =
      field === "hero_frame_path"
        ? "final_review.checks.visual_spotcheck.hero_frame_path"
        : `final_review.checks.visual_spotcheck.frame_paths[${index}]`;
    const findings: Finding[] = [];

    if (!isInsideOrEqual(absolutePath, framesDir)) {
      findings.push({
        severity: "critical",
        title: "Final review frame path is outside the expected frames directory",
        location,
        description: `${framePath} is not under ${path.join("projects", show, episode, FINAL_REVIEW_FRAMES_RELATIVE_DIR)}.`,
        proposed_fix: `Save the frame under ${path.join("projects", show, episode, FINAL_REVIEW_FRAMES_RELATIVE_DIR)} and update ${location}.`,
        status: "pending",
      });
    }

    if (!existsSync(absolutePath)) {
      findings.push({
        severity: "critical",
        title: "Final review frame file is missing",
        location,
        description: `${framePath} does not exist on disk.`,
        proposed_fix: `Write ${framePath} before final_review passes, or update ${location} to an existing sampled frame path.`,
        status: "pending",
      });
    }

    return findings;
  });
}

function isInsideOrEqual(child: string, parent: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function emptyString(value: string | undefined): boolean {
  return value === undefined || value.trim().length === 0;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/gu, " ");
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}
