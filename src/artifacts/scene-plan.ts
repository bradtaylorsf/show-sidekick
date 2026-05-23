import { z } from "zod";
import {
  AssetSourceSchema,
  CameraMovementSchema,
  ColorTemperatureSchema,
  DepthOfFieldSchema,
  LensMmSchema,
  LightingKeySchema,
  NarrativeRoleSchema,
  ShotSizeSchema,
} from "./enums.js";

export const ShotLanguageSchema = z.object({
  shot_size: ShotSizeSchema,
  camera_movement: CameraMovementSchema,
  lighting_key: LightingKeySchema,
  lens_mm: LensMmSchema,
  depth_of_field: DepthOfFieldSchema,
  color_temperature: ColorTemperatureSchema,
});

export const TimingSourceSchema = z.enum(["lyric", "word", "beat", "section", "climax", "manual", "audio_energy"]);

export const TimingRefSchema = z.object({
  lyric_line_id: z.string().optional(),
  word_id: z.string().optional(),
  beat_index: z.number().int().nonnegative().optional(),
  climax_index: z.number().int().nonnegative().optional(),
});

export const SceneTreatmentSchema = z.enum([
  "slide_image",
  "zoom_pan",
  "highlight",
  "callout",
  "caption",
  "support_visual",
]);

export const SlideRectSchema = z.object({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
  width: z.number().positive().max(1),
  height: z.number().positive().max(1),
});

export const SlideHighlightSchema = z.object({
  rect: SlideRectSchema,
  shape: z.enum(["rect", "ellipse"]).default("rect"),
  label: z.string().optional(),
});

export const SlideCalloutSchema = z.object({
  text: z.string(),
  target_rect: SlideRectSchema.optional(),
  anchor: z.enum(["top", "right", "bottom", "left"]).default("right"),
});

const TimingMetadataSchema = {
  timing_anchor: z.string().optional(),
  timing_source: TimingSourceSchema.optional(),
  timing_ref: TimingRefSchema.optional(),
  start_ms: z.number().int().nonnegative().optional(),
  end_ms: z.number().int().nonnegative().optional(),
} as const;

export const ScenePlanSchema = z.object({
  scenes: z
    .array(
      z.object({
        slug: z.string(),
        order: z.number().int().nonnegative(),
        start_s: z.number().nonnegative(),
        end_s: z.number().nonnegative(),
        ...TimingMetadataSchema,
        narrative_role: NarrativeRoleSchema,
        scene_anchor: z.string(),
        hero_moment: z.boolean().optional(),
        slide_id: z.string().optional(),
        slide_ids: z.array(z.string()).default([]),
        treatment: SceneTreatmentSchema.optional(),
        focus_rect: SlideRectSchema.optional(),
        highlights: z.array(SlideHighlightSchema).default([]),
        callouts: z.array(SlideCalloutSchema).default([]),
        caption: z.string().optional(),
        texture_keywords: z.array(z.string()).default([]),
        character_actions: z
          .array(
            z.object({
              character: z.string(),
              action: z.string(),
            }),
          )
          .default([]),
        shot_language: ShotLanguageSchema,
        required_assets: z
          .array(
            z.object({
              id: z.string(),
              source: AssetSourceSchema,
              notes: z.string().optional(),
            }),
          )
          .default([]),
      }),
    )
    .min(1),
});

export type ShotLanguage = z.infer<typeof ShotLanguageSchema>;
export type TimingRef = z.infer<typeof TimingRefSchema>;
export type SceneTreatment = z.infer<typeof SceneTreatmentSchema>;
export type SlideRect = z.infer<typeof SlideRectSchema>;
export type ScenePlan = z.infer<typeof ScenePlanSchema>;
