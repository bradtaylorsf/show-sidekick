import { z } from "zod";

type UnknownRecord = Record<string, unknown>;

const FlatPlaybookSchema = z
  .object({
    slug: z.string().optional(),
    palette: z.array(z.string()),
    transitions_allowed: z.array(z.string()),
    pacing: z.object({
      min_scene_s: z.number().nonnegative(),
      max_scene_s: z.number().positive(),
    }),
    style_cues: z.array(z.string()),
    quality_rules: z.union([z.record(z.string(), z.unknown()), z.array(z.string())]).optional(),
  })
  .passthrough()
  .superRefine((playbook, ctx) => {
    if (playbook.pacing.max_scene_s < playbook.pacing.min_scene_s) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pacing", "max_scene_s"],
        message: "pacing.max_scene_s must be greater than or equal to pacing.min_scene_s",
      });
    }
  });

export const PlaybookSchema = z.preprocess(normalizeReviewPlaybook, FlatPlaybookSchema);

export type Playbook = z.infer<typeof PlaybookSchema>;

function normalizeReviewPlaybook(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  return {
    ...value,
    palette: normalizePalette(value),
    transitions_allowed: normalizeTransitions(value),
    pacing: normalizePacing(value),
    style_cues: normalizeStyleCues(value),
  };
}

function normalizePalette(value: UnknownRecord): string[] {
  if (Array.isArray(value.palette)) {
    return value.palette.filter((item): item is string => typeof item === "string");
  }

  if (isRecord(value.palette)) {
    return Object.values(value.palette).filter((item): item is string => typeof item === "string");
  }

  const visualLanguage = isRecord(value.visual_language) ? value.visual_language : {};
  const colorPalette = isRecord(visualLanguage.color_palette) ? colorPaletteValues(visualLanguage.color_palette) : [];
  return unique(colorPalette);
}

function normalizeTransitions(value: UnknownRecord): string[] {
  if (Array.isArray(value.transitions_allowed)) {
    return value.transitions_allowed.filter((item): item is string => typeof item === "string");
  }

  const motion = isRecord(value.motion) ? value.motion : {};
  return stringArray(motion.transitions);
}

function normalizePacing(value: UnknownRecord): { min_scene_s: number; max_scene_s: number } {
  if (isRecord(value.pacing)) {
    const min = numberValue(value.pacing.min_scene_s);
    const max = numberValue(value.pacing.max_scene_s);
    if (min !== undefined && max !== undefined) {
      return { min_scene_s: min, max_scene_s: max };
    }
  }

  const motion = isRecord(value.motion) ? value.motion : {};
  const pacingRules = isRecord(motion.pacing_rules) ? motion.pacing_rules : {};
  return {
    min_scene_s: numberValue(pacingRules.min_scene_hold_seconds) ?? 2,
    max_scene_s: numberValue(pacingRules.max_scene_hold_seconds) ?? 8,
  };
}

function normalizeStyleCues(value: UnknownRecord): string[] {
  if (Array.isArray(value.style_cues)) {
    return value.style_cues.filter((item): item is string => typeof item === "string");
  }

  const identity = isRecord(value.identity) ? value.identity : {};
  const visualLanguage = isRecord(value.visual_language) ? value.visual_language : {};
  const assetGeneration = isRecord(value.asset_generation) ? value.asset_generation : {};
  const motion = isRecord(value.motion) ? value.motion : {};

  return unique([
    ...stringArray(identity.mood),
    ...stringArray(visualLanguage.composition),
    ...stringArray(visualLanguage.texture),
    ...stringArray(assetGeneration.image_prompt_prefix),
    ...stringArray(assetGeneration.consistency_anchors),
    ...stringArray(motion.animation_style),
  ]);
}

function colorPaletteValues(record: UnknownRecord): string[] {
  return unique([
    ...stringArray(record.primary),
    ...stringArray(record.accent),
    ...stringArray(record.background),
    ...stringArray(record.text),
    ...stringArray(record.muted),
  ]);
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return typeof value === "string" && value.length > 0 ? [value] : [];
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function unique(values: string[]): string[] {
  return [...new Set(values.filter((value) => value.length > 0))];
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
