import type { FindingSeverity } from "../artifacts/review.js";

type UnknownRecord = Record<string, unknown>;

export const GENERIC_PHRASES = Object.freeze([
  "beautiful",
  "stunning",
  "amazing",
  "epic",
  "cinematic shot",
  "wide shot",
  "close up",
  "the scene",
  "the moment",
  "a person",
  "someone",
  "people",
  "a place",
  "a view",
  "showing",
  "depicting",
  "featuring",
  "highlighting",
  "visualizing",
  "demonstrating",
  "illustrating",
] as const);

export const DESCRIPTION_SPECIFICITY_EXAMPLE =
  "Instead of 'a beautiful cityscape', try 'rain-slicked Tokyo intersection at night, neon reflections on wet asphalt'";

export const SCENE_VARIATION_CHECKS = [
  "shot_size_variety",
  "consecutive_same_size_shots",
  "static_shot_overuse",
  "lighting_variety",
  "hero_moment_distinctness",
  "description_specificity",
  "texture_keywords_presence",
  "shot_intent_completeness",
] as const;

export type SceneVariationCheckName = (typeof SCENE_VARIATION_CHECKS)[number];
export type SceneVariationVerdict = "poor" | "fair" | "good" | "excellent";

export type SceneVariationViolation = {
  check: SceneVariationCheckName;
  severity: Extract<FindingSeverity, "critical" | "suggestion">;
  scene_index?: number;
  message: string;
};

export type SceneVariationResult = {
  score: number;
  verdict: SceneVariationVerdict;
  violations: SceneVariationViolation[];
};

type DraftViolation = Omit<SceneVariationViolation, "severity">;

const MIN_FULL_RUBRIC_SCENES = 4;

export function checkSceneVariation(scenes: UnknownRecord[]): SceneVariationResult {
  const draftViolations: DraftViolation[] =
    scenes.length >= MIN_FULL_RUBRIC_SCENES
      ? [
          ...checkShotSizeVariety(scenes),
          ...checkConsecutiveSameSizeShots(scenes),
          ...checkStaticShotOveruse(scenes),
          ...checkLightingVariety(scenes),
          ...checkHeroMomentDistinctness(scenes),
          ...checkDescriptionSpecificity(scenes),
          ...checkTextureKeywordsPresence(scenes),
          ...checkShotIntentCompleteness(scenes),
        ]
      : [
          ...checkDescriptionSpecificity(scenes),
          ...checkTextureKeywordsPresence(scenes),
          ...checkShotIntentCompleteness(scenes),
        ];

  const score = Math.min(5.0, draftViolations.length * 0.6);
  const verdict = verdictForScore(score);
  const severity = verdict === "poor" ? "critical" : "suggestion";

  return {
    score,
    verdict,
    violations: draftViolations.map((violation) => ({ ...violation, severity })),
  };
}

function checkShotSizeVariety(scenes: UnknownRecord[]): DraftViolation[] {
  const buckets = new Set(scenes.map((scene) => shotSizeBucket(shotLanguageValue(scene, "shot_size"))).filter(isPresentString));
  if (buckets.size >= 3) {
    return [];
  }

  return [
    {
      check: "shot_size_variety",
      message: `Shot size distribution spans ${buckets.size} bucket(s); use at least 3 across ECU/CU/MS/WS/EWS.`,
    },
  ];
}

function checkConsecutiveSameSizeShots(scenes: UnknownRecord[]): DraftViolation[] {
  let runSize = 0;
  let previousSize: string | undefined;

  for (let index = 0; index < scenes.length; index += 1) {
    const shotSize = shotLanguageValue(scenes[index] ?? {}, "shot_size");
    if (shotSize !== undefined && normalizeToken(shotSize) === previousSize) {
      runSize += 1;
    } else {
      previousSize = shotSize === undefined ? undefined : normalizeToken(shotSize);
      runSize = shotSize === undefined ? 0 : 1;
    }

    if (runSize >= 3) {
      return [
        {
          check: "consecutive_same_size_shots",
          scene_index: index,
          message: `Scenes ${index - 2}-${index} repeat shot_size "${shotSize}".`,
        },
      ];
    }
  }

  return [];
}

function checkStaticShotOveruse(scenes: UnknownRecord[]): DraftViolation[] {
  const staticCount = scenes.filter((scene) => normalizeToken(shotLanguageValue(scene, "camera_movement") ?? "") === "static").length;
  const ratio = staticCount / scenes.length;
  if (ratio <= 0.5) {
    return [];
  }

  return [
    {
      check: "static_shot_overuse",
      message: `${Math.round(ratio * 100)}% of scenes use camera_movement: static; keep static shots at 50% or less.`,
    },
  ];
}

function checkLightingVariety(scenes: UnknownRecord[]): DraftViolation[] {
  const lightingKeys = new Set(scenes.map((scene) => shotLanguageValue(scene, "lighting_key")).filter(isPresentString).map(normalizeToken));
  if (lightingKeys.size >= 2) {
    return [];
  }

  return [
    {
      check: "lighting_variety",
      message: `Lighting uses ${lightingKeys.size} distinct lighting_key value(s); use at least 2.`,
    },
  ];
}

function checkHeroMomentDistinctness(scenes: UnknownRecord[]): DraftViolation[] {
  const violations: DraftViolation[] = [];

  scenes.forEach((scene, index) => {
    if (scene.hero_moment !== true || index === 0 || index === scenes.length - 1) {
      return;
    }

    const heroShotSize = shotLanguageValue(scene, "shot_size");
    const previousShotSize = shotLanguageValue(scenes[index - 1] ?? {}, "shot_size");
    const nextShotSize = shotLanguageValue(scenes[index + 1] ?? {}, "shot_size");
    if (
      heroShotSize === undefined ||
      normalizeToken(heroShotSize) === normalizeToken(previousShotSize ?? "") ||
      normalizeToken(heroShotSize) === normalizeToken(nextShotSize ?? "")
    ) {
      violations.push({
        check: "hero_moment_distinctness",
        scene_index: index,
        message: `Hero scene ${index} shot_size must differ from both immediate neighbors.`,
      });
    }
  });

  return violations;
}

function checkDescriptionSpecificity(scenes: UnknownRecord[]): DraftViolation[] {
  return scenes.flatMap((scene, index) => {
    const description = stringValue(scene.description);
    if (description === undefined) {
      return [];
    }

    const lowerDescription = description.toLowerCase();
    const matchedPhrase = GENERIC_PHRASES.find((phrase) => lowerDescription.includes(phrase));
    if (matchedPhrase === undefined) {
      return [];
    }

    return [
      {
        check: "description_specificity",
        scene_index: index,
        message: `Scene ${index} description contains generic phrase "${matchedPhrase}". ${DESCRIPTION_SPECIFICITY_EXAMPLE}.`,
      },
    ];
  });
}

function checkTextureKeywordsPresence(scenes: UnknownRecord[]): DraftViolation[] {
  const hasTextureKeywords = scenes.some((scene) => {
    const keywords = scene.texture_keywords;
    return Array.isArray(keywords) && keywords.some((keyword) => isPresentString(stringValue(keyword)));
  });
  if (hasTextureKeywords) {
    return [];
  }

  return [
    {
      check: "texture_keywords_presence",
      message: "No scene has non-empty texture_keywords[].",
    },
  ];
}

function checkShotIntentCompleteness(scenes: UnknownRecord[]): DraftViolation[] {
  const missingIndex = scenes.findIndex((scene) => !isPresentString(stringValue(scene.shot_intent)));
  if (missingIndex === -1) {
    return [];
  }

  return [
    {
      check: "shot_intent_completeness",
      scene_index: missingIndex,
      message: `Scene ${missingIndex} is missing non-empty shot_intent.`,
    },
  ];
}

function verdictForScore(score: number): SceneVariationVerdict {
  if (score < 2) {
    return "poor";
  }
  if (score < 3) {
    return "fair";
  }
  if (score < 4) {
    return "good";
  }

  return "excellent";
}

function shotSizeBucket(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalizedValue = value.trim().toUpperCase();
  if (normalizedValue === "ECU" || normalizedValue === "EWS") {
    return normalizedValue;
  }
  if (normalizedValue === "CU" || normalizedValue === "MCU") {
    return "CU";
  }
  if (normalizedValue === "MS" || normalizedValue === "MLS") {
    return "MS";
  }
  if (normalizedValue === "WS" || normalizedValue === "LS") {
    return "WS";
  }

  return undefined;
}

function shotLanguageValue(scene: UnknownRecord, key: string): string | undefined {
  const shotLanguage = isRecord(scene.shot_language) ? scene.shot_language : undefined;
  return stringValue(shotLanguage?.[key] ?? scene[key]);
}

function normalizeToken(value: string): string {
  return value.trim().toLowerCase();
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function isPresentString(value: string | undefined): value is string {
  return value !== undefined;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
