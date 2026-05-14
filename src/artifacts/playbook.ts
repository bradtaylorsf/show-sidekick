import { z } from "zod";

type UnknownRecord = Record<string, unknown>;

export const CaptionPositionSchema = z.enum(["top", "center", "bottom"]);

export const PlaybookCaptionStyleSchema = z.object({
  font_family: z.string().default("Inter"),
  font_size: z.number().positive().default(54),
  font_weight: z.union([z.number().int().positive(), z.string()]).default(800),
  fill: z.string().default("#f8fafc"),
  inactive_fill: z.string().default("#cbd5e1"),
  active_fill: z.string().default("#38bdf8"),
  stroke: z.string().default("#020617"),
  stroke_width: z.number().nonnegative().default(4),
  background: z.string().default("rgba(2, 6, 23, 0.72)"),
  position: CaptionPositionSchema.default("bottom"),
  max_chars_per_line: z.number().int().positive().default(32),
});

export const PlaybookSchema = z.preprocess(
  normalizeArtifactPlaybook,
  z
    .object({
      slug: z.string().optional(),
      palette: z.record(z.string()).default({}),
      typography: z.record(z.unknown()).default({}),
      motion: z.record(z.unknown()).default({}),
      caption_style: PlaybookCaptionStyleSchema.optional(),
    })
    .passthrough(),
);

export type PlaybookCaptionStyle = z.infer<typeof PlaybookCaptionStyleSchema>;
export type Playbook = z.infer<typeof PlaybookSchema>;

function normalizeArtifactPlaybook(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }

  const palette = normalizePalette(value);
  const typography = normalizeTypography(value);
  const motion = normalizeMotion(value);

  return {
    ...value,
    palette,
    typography,
    motion,
  };
}

function normalizePalette(value: UnknownRecord): Record<string, string> {
  const existing = isRecord(value.palette) ? stringRecord(value.palette) : paletteArrayToRecord(value.palette);
  const visualLanguage = isRecord(value.visual_language) ? value.visual_language : {};
  const colorPalette = isRecord(visualLanguage.color_palette) ? visualLanguage.color_palette : {};
  const primary = stringArray(colorPalette.primary);
  const accent = stringArray(colorPalette.accent);
  const derived = stringRecord({
    primary: firstString(primary),
    secondary: primary[1] ?? firstString(accent),
    accent: firstString(accent),
    background: colorPalette.background,
    surface: colorPalette.background,
    text: colorPalette.text,
    muted: colorPalette.muted,
  });

  return { ...derived, ...existing };
}

function normalizeTypography(value: UnknownRecord): UnknownRecord {
  const existing = isRecord(value.typography) ? { ...value.typography } : {};
  const headings = isRecord(existing.headings) ? existing.headings : {};
  const body = isRecord(existing.body) ? existing.body : {};
  const code = isRecord(existing.code) ? existing.code : {};
  const statCard = isRecord(existing.stat_card) ? existing.stat_card : {};

  return {
    ...existing,
    display: typeof existing.display === "string" ? existing.display : stringValue(headings.font),
    body: typeof existing.body === "string" ? existing.body : stringValue(body.font),
    mono: typeof existing.mono === "string" ? existing.mono : stringValue(code.font),
    title_size: typeof existing.title_size === "number" ? existing.title_size : sizeFromMultiplier(statCard.size_multiplier),
  };
}

function normalizeMotion(value: UnknownRecord): UnknownRecord {
  const existing = isRecord(value.motion) ? { ...value.motion } : {};
  const pacingRules = isRecord(existing.pacing_rules) ? existing.pacing_rules : {};
  const transitionDuration = numberValue(pacingRules.transition_duration_seconds);

  return {
    ...existing,
    allowed_transitions: Array.isArray(existing.allowed_transitions)
      ? existing.allowed_transitions
      : stringArray(existing.transitions),
    fast_ms: typeof existing.fast_ms === "number" ? existing.fast_ms : secondsToMs(transitionDuration),
    medium_ms: typeof existing.medium_ms === "number" ? existing.medium_ms : secondsToMs(transitionDuration, 2),
    slow_ms: typeof existing.slow_ms === "number" ? existing.slow_ms : secondsToMs(numberValue(pacingRules.text_card_hold_seconds)),
    ease: typeof existing.ease === "string" ? existing.ease : stringValue(existing.animation_style),
  };
}

function paletteArrayToRecord(value: unknown): Record<string, string> {
  const colors = stringArray(value);
  return stringRecord({
    primary: colors[0],
    secondary: colors[1],
    accent: colors[2],
    background: colors[3],
    text: colors[4],
  });
}

function stringRecord(record: UnknownRecord): Record<string, string> {
  return Object.fromEntries(
    Object.entries(record).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : [])),
  );
}

function stringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return typeof value === "string" ? [value] : [];
}

function firstString(values: string[]): string | undefined {
  return values[0];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function secondsToMs(value: number | undefined, multiplier = 1): number | undefined {
  return value === undefined ? undefined : Math.round(value * multiplier * 1000);
}

function sizeFromMultiplier(value: unknown): number | undefined {
  const multiplier = numberValue(value);
  return multiplier === undefined ? undefined : Math.round(32 * multiplier);
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
