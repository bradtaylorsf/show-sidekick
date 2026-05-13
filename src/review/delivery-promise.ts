import type { Cut } from "../artifacts/edit-decisions.js";
import type { Finding } from "../artifacts/review.js";

type UnknownRecord = Record<string, unknown>;

export const DELIVERY_PROMISES = [
  "motion_led",
  "cinematic_hybrid",
  "avatar_presenter",
  "hybrid",
  "narration_over_graphics",
  "still_led",
  "source_led",
  "screen_demo",
] as const;

export type DeliveryPromise = (typeof DELIVERY_PROMISES)[number];

export type PromiseRule = {
  min_motion_ratio: number;
  still_fallback_allowed: boolean;
  requires_video_generation: boolean;
};

export const PROMISE_RULES: Record<DeliveryPromise, PromiseRule> = {
  motion_led: { min_motion_ratio: 0.7, still_fallback_allowed: false, requires_video_generation: true },
  cinematic_hybrid: { min_motion_ratio: 0.5, still_fallback_allowed: false, requires_video_generation: true },
  avatar_presenter: { min_motion_ratio: 0.3, still_fallback_allowed: true, requires_video_generation: false },
  hybrid: { min_motion_ratio: 0.2, still_fallback_allowed: true, requires_video_generation: false },
  narration_over_graphics: { min_motion_ratio: 0.1, still_fallback_allowed: true, requires_video_generation: false },
  still_led: { min_motion_ratio: 0, still_fallback_allowed: true, requires_video_generation: false },
  source_led: { min_motion_ratio: 0, still_fallback_allowed: true, requires_video_generation: false },
  screen_demo: { min_motion_ratio: 0, still_fallback_allowed: true, requires_video_generation: false },
};

const SLIDE_GRAMMAR_TYPES = [
  "text_card",
  "stat_card",
  "callout",
  "comparison",
  "hero_title",
  "ken_burns",
  "slide_in",
  "slide_out",
  "fade_in",
  "fade_out",
] as const;

const REAL_MOTION_TYPES = ["video_clip", "animation", "motion_graphic"] as const;

export const _SLIDE_GRAMMAR_TYPES: ReadonlySet<string> = Object.freeze(new Set<string>(SLIDE_GRAMMAR_TYPES));
export const _REAL_MOTION_TYPES: ReadonlySet<string> = Object.freeze(new Set<string>(REAL_MOTION_TYPES));
export const VIDEO_EXTENSIONS = ["mp4", "mov", "webm", "avi", "mkv"] as const;

const IMAGE_EXTENSIONS = ["jpg", "jpeg", "png", "gif", "webp", "avif", "tif", "tiff"] as const;
const VIDEO_EXTENSION_SET: ReadonlySet<string> = new Set(VIDEO_EXTENSIONS);
const IMAGE_EXTENSION_SET: ReadonlySet<string> = new Set(IMAGE_EXTENSIONS);

export type ClassifyBriefInput = {
  pipeline?: string;
  renderer_family?: string;
  audience?: string;
  tone?: string;
  narration_required?: boolean;
  motion_required?: boolean;
  has_footage?: boolean;
  talking_head?: boolean;
  explainer?: boolean;
};

export type PromiseAsset = {
  id: string;
  cut_type?: string;
  path?: string;
};

export type ValidateCutsOptions = {
  approved_fallback?: string;
  assets?: PromiseAsset[];
  narration_required?: boolean;
  narration_present?: boolean;
};

export type ValidationResult = {
  findings: Finding[];
  motion_ratio: number;
  slide_cuts: number;
  still_cuts: number;
  motion_cuts: number;
  total: number;
};

export type DeliveryPromiseContext = {
  deliveryPromise?: DeliveryPromise;
  brief?: ClassifyBriefInput;
  assets?: PromiseAsset[];
  narrationRequired?: boolean;
  narrationPresent?: boolean;
  approvedFallback?: string;
};

export function classifyFromBrief(brief: ClassifyBriefInput): DeliveryPromise {
  const signals = [
    brief.pipeline,
    brief.renderer_family,
    brief.audience,
    brief.tone,
  ]
    .filter((signal): signal is string => signal !== undefined)
    .join(" ")
    .toLowerCase();

  let promise: DeliveryPromise = "hybrid";
  if (signals.includes("screen-demo") || signals.includes("screen demo")) {
    promise = "screen_demo";
  } else if (brief.talking_head === true || signals.includes("talking-head") || signals.includes("presenter")) {
    promise = "avatar_presenter";
  } else if (signals.includes("product-reveal") || signals.includes("product reveal")) {
    promise = "cinematic_hybrid";
  } else if (signals.includes("cinematic") || signals.includes("cinematic-trailer")) {
    promise = "motion_led";
  } else if (
    (brief.explainer === true || signals.includes("explainer")) &&
    (brief.narration_required === true || signals.includes("narration"))
  ) {
    promise = "narration_over_graphics";
  }

  if (brief.motion_required === false && promise === "motion_led") {
    promise = "hybrid";
  }

  if (brief.has_footage === true) {
    promise = "source_led";
  }

  return promise;
}

export function validateCuts(
  promise: DeliveryPromise,
  cuts: Cut[],
  opts: ValidateCutsOptions = {},
): ValidationResult {
  const assetsById = new Map((opts.assets ?? []).map((asset) => [asset.id, asset]));
  const classifiedCuts = cuts.map((cut) => classifyCut(cut, assetsById));
  const total = cuts.length;
  const motion_cuts = classifiedCuts.filter((classification) => classification === "motion").length;
  const slide_cuts = classifiedCuts.filter((classification) => classification === "slide").length;
  const still_cuts = classifiedCuts.filter((classification) => classification === "still").length;
  const motion_ratio = total === 0 ? 0 : motion_cuts / total;
  const findings: Finding[] = [];
  const rule = PROMISE_RULES[promise];

  if (motion_ratio < rule.min_motion_ratio) {
    findings.push({
      severity: "critical",
      title: "Delivery promise motion ratio is below threshold",
      location: "edit_decisions.cuts",
      description: `${promise} requires motion_ratio >= ${rule.min_motion_ratio}, but actual motion_ratio is ${motion_ratio.toFixed(2)}.`,
      proposed_fix: `Replace still or slide cuts until motion_ratio is at least ${rule.min_motion_ratio}; current value is ${motion_ratio.toFixed(2)} across ${total} cuts.`,
      status: "pending",
    });
  }

  if (!rule.still_fallback_allowed && slide_cuts + still_cuts > total * 0.5 && opts.approved_fallback !== "still_led") {
    findings.push({
      severity: "critical",
      title: "Motion-led delivery silently downgraded to still-led",
      location: "edit_decisions.cuts",
      description: `${promise} does not allow still fallback, but ${slide_cuts + still_cuts}/${total} cuts are slide or still cuts without approved_fallback "still_led".`,
      proposed_fix: `Add generated motion/video cuts or record approved_fallback "still_led"; current slide+still count is ${slide_cuts + still_cuts}/${total}.`,
      status: "pending",
    });
  }

  if (isNarrationRequiredPromise(promise, opts) && opts.narration_present === false) {
    findings.push({
      severity: "critical",
      title: "Narration-required delivery dropped narration",
      location: "edit_decisions.audio",
      description: `${promise} requires narration, but narration_present is false.`,
      proposed_fix: `Restore narration audio for "${promise}" or change the approved delivery promise before edit review round 1; narration_present must be true.`,
      status: "pending",
    });
  }

  return {
    findings,
    motion_ratio,
    slide_cuts,
    still_cuts,
    motion_cuts,
    total,
  };
}

export function checkDeliveryPromise(
  stageSlug: string,
  artifact: unknown,
  ctx: DeliveryPromiseContext,
): Finding[] {
  if (!isDeliveryPromiseStage(stageSlug) || !hasCuts(artifact) || artifact.cuts.length === 0) {
    return [];
  }

  const promise = ctx.deliveryPromise ?? (ctx.brief === undefined ? undefined : classifyFromBrief(ctx.brief));
  if (promise === undefined) {
    return [];
  }

  return validateCuts(promise, artifact.cuts, {
    approved_fallback: ctx.approvedFallback,
    assets: ctx.assets,
    narration_required: ctx.narrationRequired,
    narration_present: ctx.narrationPresent,
  }).findings;
}

function classifyCut(cut: Cut, assetsById: Map<string, PromiseAsset>): "motion" | "slide" | "still" | "unknown" {
  const cutRecord: UnknownRecord = isRecord(cut) ? cut : {};
  const asset = assetsById.get(cut.asset_id);
  const cutType = stringValue(asset?.cut_type ?? cutRecord.cut_type)?.toLowerCase();
  const path = stringValue(asset?.path ?? cutRecord.path ?? cut.asset_id);
  const extension = path === undefined ? undefined : fileExtension(path);

  if (cutType !== undefined && _REAL_MOTION_TYPES.has(cutType)) {
    return "motion";
  }

  if (extension !== undefined && VIDEO_EXTENSION_SET.has(extension)) {
    return "motion";
  }

  if (cutType !== undefined && _SLIDE_GRAMMAR_TYPES.has(cutType)) {
    return "slide";
  }

  if (cutType === "still" || cutType === "image" || (extension !== undefined && IMAGE_EXTENSION_SET.has(extension))) {
    return "still";
  }

  return "unknown";
}

function isNarrationRequiredPromise(promise: DeliveryPromise, opts: ValidateCutsOptions): boolean {
  return promise === "narration_over_graphics" || opts.narration_required === true;
}

function isDeliveryPromiseStage(stageSlug: string): boolean {
  return stageSlug === "edit" || stageSlug === "compose" || stageSlug === "edit_decisions";
}

function hasCuts(value: unknown): value is { cuts: Cut[] } {
  return isRecord(value) && Array.isArray(value.cuts);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function fileExtension(path: string): string | undefined {
  const extension = path.split(".").at(-1)?.toLowerCase();
  if (extension === undefined) {
    return undefined;
  }

  return extension;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
