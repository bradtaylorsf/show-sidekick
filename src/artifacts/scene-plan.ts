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

export const ScenePlanSchema = z.object({
  scenes: z
    .array(
      z.object({
        slug: z.string(),
        order: z.number().int().nonnegative(),
        start_s: z.number().nonnegative(),
        end_s: z.number().nonnegative(),
        narrative_role: NarrativeRoleSchema,
        scene_anchor: z.string(),
        hero_moment: z.boolean().optional(),
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
export type ScenePlan = z.infer<typeof ScenePlanSchema>;
