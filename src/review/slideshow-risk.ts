import type { Finding } from "../artifacts/review.js";
import { _SLIDE_GRAMMAR_TYPES } from "./delivery-promise.js";
import { mean } from "./scoring.js";

type UnknownRecord = Record<string, unknown>;

export const SLIDESHOW_RISK_DIMENSIONS = [
  "repetition",
  "decorative_visuals",
  "weak_motion",
  "weak_shot_intent",
  "typography_overreliance",
  "unsupported_cinematic_claims",
] as const;

export type SlideshowRiskDimensionName = (typeof SLIDESHOW_RISK_DIMENSIONS)[number];
export type SlideshowRiskVerdict = "fail" | "revise" | "acceptable" | "strong";

export type SlideshowRiskDimension = {
  score: number;
  reason: string;
};

export type SlideshowRiskResult = {
  score: number;
  verdict: SlideshowRiskVerdict;
  dimensions: Record<SlideshowRiskDimensionName, SlideshowRiskDimension>;
  findings: Finding[];
};

export type SlideshowEditInput = UnknownRecord & {
  cuts?: unknown[];
};

const TEXT_CARD_TYPES = new Set(["text_card", "stat_card"]);
const FLAG_THRESHOLD = 3.0;

export function scoreSlideshowRisk(
  scenes: UnknownRecord[],
  edit?: SlideshowEditInput | string,
  rendererFamily = "",
): SlideshowRiskResult {
  const resolvedEdit = typeof edit === "string" ? undefined : edit;
  const resolvedRendererFamily = typeof edit === "string" ? edit : rendererFamily;

  const dimensions =
    scenes.length === 0
      ? scoreEmptyScenes(resolvedRendererFamily)
      : {
          repetition: scoreRepetition(scenes, resolvedEdit),
          decorative_visuals: scoreDecorativeVisuals(scenes),
          weak_motion: scoreWeakMotion(scenes),
          weak_shot_intent: scoreWeakShotIntent(scenes),
          typography_overreliance: scoreTypographyOverreliance(scenes, resolvedEdit),
          unsupported_cinematic_claims: scoreUnsupportedCinematicClaims(scenes, resolvedRendererFamily),
        };

  const score = scenes.length === 0 ? 5.0 : roundScore(mean(SLIDESHOW_RISK_DIMENSIONS.map((name) => dimensions[name].score)));

  return {
    score,
    verdict: verdictForScore(score),
    dimensions,
    findings: findingsForDimensions(dimensions),
  };
}

export function detectEditRegression(
  scenePlanResult: Pick<SlideshowRiskResult, "score">,
  editResult: Pick<SlideshowRiskResult, "score">,
): Finding[] {
  if (editResult.score <= scenePlanResult.score) {
    return [];
  }

  return [
    {
      severity: "critical",
      title: "edit_regression",
      location: "edit",
      description: `Slideshow risk increased from ${scenePlanResult.score.toFixed(2)} at scene_plan to ${editResult.score.toFixed(2)} at edit.`,
      proposed_fix: `Revise edit decisions until slideshow risk is no higher than the scene_plan score of ${scenePlanResult.score.toFixed(2)}; current edit score is ${editResult.score.toFixed(2)}.`,
      status: "pending",
    },
  ];
}

function scoreEmptyScenes(rendererFamily: string): Record<SlideshowRiskDimensionName, SlideshowRiskDimension> {
  return {
    repetition: {
      score: 5.0,
      reason: "0 scenes use the same layout/shot size — vary the visual grammar",
    },
    decorative_visuals: {
      score: 5.0,
      reason: "0 scenes have no stated purpose (no information_role or shot_intent)",
    },
    weak_motion: {
      score: 5.0,
      reason: "Camera movement exists but lacks narrative justification",
    },
    weak_shot_intent: {
      score: 5.0,
      reason: "0 scenes are missing shot_intent — why does this frame exist?",
    },
    typography_overreliance: {
      score: 5.0,
      reason: "100% of scenes are text/stat cards — video feels like animated slides",
    },
    unsupported_cinematic_claims: scoreUnsupportedCinematicClaims([], rendererFamily),
  };
}

function scoreRepetition(scenes: UnknownRecord[], edit: SlideshowEditInput | undefined): SlideshowRiskDimension {
  const typeValues = extractCutTypes(scenes, edit);
  const shotSizes = scenes.map((scene) => shotLanguageValue(scene, "shot_size")).filter(isPresentString);
  const descriptions = scenes.map((scene) => stringValue(scene.description)).filter(isPresentString);
  const total = scenes.length;

  const mostCommonType = mostCommonCount(typeValues);
  const mostCommonShotSize = mostCommonCount(shotSizes);
  const typeRatio = typeValues.length === 0 ? 0 : mostCommonType / typeValues.length;
  const uniqueDescRatio = descriptions.length === 0 ? 0 : new Set(descriptions.map(normalizeToken)).size / total;
  const sizeRatio = shotSizes.length === 0 ? 0 : mostCommonShotSize / total;

  let score = 0;
  if (typeRatio > 0.7) {
    score += 2.0;
  }
  if (uniqueDescRatio < 0.6) {
    score += 1.5;
  }
  if (sizeRatio > 0.6) {
    score += 1.5;
  }

  const repeatedDescriptionCount = descriptions.length === 0 ? total : total - new Set(descriptions.map(normalizeToken)).size;
  const repeatedCount = Math.max(mostCommonType, mostCommonShotSize, repeatedDescriptionCount);

  return {
    score: roundScore(score),
    reason: `${repeatedCount} scenes use the same layout/shot size — vary the visual grammar`,
  };
}

function scoreDecorativeVisuals(scenes: UnknownRecord[]): SlideshowRiskDimension {
  const staticSlideCount = scenes.filter(isStaticSlidePlayback).length;
  const count = Math.min(scenes.length, scenes.filter((scene) => !hasPurpose(scene)).length + staticSlideCount);

  return {
    score: roundScore((count / scenes.length) * 5),
    reason:
      staticSlideCount > 0
        ? `static slideshow downgrade: ${staticSlideCount} slide scenes lack explanatory treatment or purpose`
        : `${count} scenes have no stated purpose (no information_role or shot_intent)`,
  };
}

function scoreWeakMotion(scenes: UnknownRecord[]): SlideshowRiskDimension {
  const staticSlideCount = scenes.filter(isStaticSlidePlayback).length;
  if (staticSlideCount > 0) {
    return {
      score: roundScore((staticSlideCount / scenes.length) * 5),
      reason: `static slideshow downgrade: ${staticSlideCount} slide scenes lack zoom, pan, highlight, callout, or support visual treatment`,
    };
  }

  const movingScenes = scenes.filter((scene) => {
    const movement = shotLanguageValue(scene, "camera_movement");
    return movement !== undefined && normalizeToken(movement) !== "static";
  });
  const weakCount = movingScenes.filter((scene) => !hasNarrativeMotionJustification(scene)).length;

  return {
    score: movingScenes.length === 0 ? 0 : roundScore((weakCount / movingScenes.length) * 5),
    reason: "Camera movement exists but lacks narrative justification",
  };
}

function scoreWeakShotIntent(scenes: UnknownRecord[]): SlideshowRiskDimension {
  const count = scenes.filter((scene) => !isPresentString(stringValue(scene.shot_intent))).length;

  return {
    score: roundScore((count / scenes.length) * 5),
    reason: `${count} scenes are missing shot_intent — why does this frame exist?`,
  };
}

function scoreTypographyOverreliance(scenes: UnknownRecord[], edit: SlideshowEditInput | undefined): SlideshowRiskDimension {
  const candidates = editCuts(edit);
  const records = candidates.length > 0 ? candidates : scenes;
  const textCardCount = records.filter(isTextOrStatCard).length;
  const ratio = records.length === 0 ? 0 : textCardCount / records.length;
  const score = ratio > 0.6 ? 4.0 : ratio > 0.4 ? 2.5 : ratio > 0.2 ? 1.0 : 0.0;

  return {
    score,
    reason: `${Math.round(ratio * 100)}% of scenes are text/stat cards — video feels like animated slides`,
  };
}

function scoreUnsupportedCinematicClaims(scenes: UnknownRecord[], rendererFamily: string): SlideshowRiskDimension {
  if (!rendererFamily.toLowerCase().includes("cinematic")) {
    return {
      score: 0.0,
      reason: "Not applicable for non-cinematic renderer_family",
    };
  }

  const lightingKeys = new Set(scenes.map((scene) => shotLanguageValue(scene, "lighting_key")).filter(isPresentString));
  const movingCameraCount = scenes.filter((scene) => {
    const movement = shotLanguageValue(scene, "camera_movement");
    return movement !== undefined && normalizeToken(movement) !== "static";
  }).length;
  const hasHeroMoment = scenes.some((scene) => scene.hero_moment === true);

  let score = 0;
  if (!hasHeroMoment) {
    score += 2.0;
  }
  if (lightingKeys.size < 2) {
    score += 1.5;
  }
  if (movingCameraCount === 0) {
    score += 1.5;
  }

  return {
    score: roundScore(score),
    reason: "Claiming cinematic but missing hero moments / lighting / movement",
  };
}

function findingsForDimensions(
  dimensions: Record<SlideshowRiskDimensionName, SlideshowRiskDimension>,
): Finding[] {
  return SLIDESHOW_RISK_DIMENSIONS.flatMap((name) => {
    const dimension = dimensions[name];
    if (dimension.score < FLAG_THRESHOLD) {
      return [];
    }

    return [
      {
        severity: "suggestion",
        title: name,
        location: "scenes",
        description: dimension.reason,
        proposed_change: `Revise scenes to reduce ${name} below ${FLAG_THRESHOLD.toFixed(1)}; current score is ${dimension.score.toFixed(1)}.`,
        status: "pending",
      } satisfies Finding,
    ];
  });
}

function verdictForScore(score: number): SlideshowRiskVerdict {
  if (score >= 4.0) {
    return "fail";
  }
  if (score >= 3.0) {
    return "revise";
  }
  if (score >= 2.0) {
    return "acceptable";
  }

  return "strong";
}

function extractCutTypes(scenes: UnknownRecord[], edit: SlideshowEditInput | undefined): string[] {
  const cuts = editCuts(edit);
  const source = cuts.length > 0 ? cuts : scenes;

  return source.map(layoutType).filter(isPresentString);
}

function editCuts(edit: SlideshowEditInput | undefined): UnknownRecord[] {
  if (edit === undefined || !Array.isArray(edit.cuts)) {
    return [];
  }

  return edit.cuts.filter(isRecord);
}

function layoutType(value: UnknownRecord): string | undefined {
  const type = firstStringField(value, ["cut_type", "layout_type", "scene_type", "scene_kind", "visual_type", "type"]);
  if (type === undefined) {
    return undefined;
  }

  const normalizedType = normalizeToken(type);
  if (_SLIDE_GRAMMAR_TYPES.has(normalizedType) || normalizedType.length > 0) {
    return normalizedType;
  }

  return undefined;
}

function isTextOrStatCard(value: UnknownRecord): boolean {
  const type = layoutType(value);
  return type !== undefined && TEXT_CARD_TYPES.has(type);
}

function isStaticSlidePlayback(scene: UnknownRecord): boolean {
  if (layoutType(scene) !== "slide_scene" && stringValue(scene.slide_id) === undefined && stringArray(scene.slide_ids).length === 0) {
    return false;
  }

  const treatment = stringValue(scene.treatment);
  const movement = shotLanguageValue(scene, "camera_movement");
  const motion = isRecord(scene.motion) ? stringValue(scene.motion.type) : undefined;
  const hasMotion = [movement, motion].some((value) => value !== undefined && !["static", "none"].includes(normalizeToken(value)));
  const hasTreatment = treatment !== undefined && treatment !== "slide_image";
  const hasHighlight = Array.isArray(scene.highlights) && scene.highlights.length > 0;
  const hasCallout = Array.isArray(scene.callouts) && scene.callouts.length > 0;
  const hasSupport = stringArray(scene.support_visuals).length > 0 || stringArray(scene.required_support_visuals).length > 0;
  const hasFocus = isRecord(scene.focus_rect);

  return !(hasMotion || hasTreatment || hasHighlight || hasCallout || hasSupport || hasFocus);
}

function hasPurpose(scene: UnknownRecord): boolean {
  return (
    isPresentString(stringValue(scene.information_role)) ||
    isPresentString(stringValue(scene.shot_intent))
  );
}

function hasNarrativeMotionJustification(scene: UnknownRecord): boolean {
  return (
    isPresentString(stringValue(scene.shot_intent)) ||
    isPresentString(stringValue(scene.narrative_role)) ||
    isPresentString(stringValue(scene.information_role))
  );
}

function shotLanguageValue(scene: UnknownRecord, key: string): string | undefined {
  const shotLanguage = isRecord(scene.shot_language) ? scene.shot_language : undefined;
  return stringValue(shotLanguage?.[key] ?? scene[key]);
}

function firstStringField(record: UnknownRecord, fields: string[]): string | undefined {
  for (const field of fields) {
    const value = stringValue(record[field]);
    if (value !== undefined) {
      return value;
    }
  }

  return undefined;
}

function mostCommonCount(values: string[]): number {
  const counts = new Map<string, number>();
  values.forEach((value) => {
    const key = normalizeToken(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  });

  return Math.max(0, ...counts.values());
}

function roundScore(value: number): number {
  return Number(value.toFixed(2));
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function isPresentString(value: string | undefined): value is string {
  return value !== undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
