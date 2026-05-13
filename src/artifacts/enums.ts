import { z } from "zod";

export const RENDER_RUNTIME = ["ffmpeg", "remotion", "hyperframes"] as const;
export const RENDERER_FAMILY = [
  "explainer-data",
  "explainer-teacher",
  "cinematic-trailer",
  "documentary-montage",
  "product-reveal",
  "screen-demo",
  "presenter",
  "animation-first",
] as const;
export const AUDIO_ARCHITECTURE = [
  "single_narrator",
  "character_dialogue",
  "narrator_plus_characters",
  "no_narration",
] as const;
export const SHOT_SIZE = ["ECU", "CU", "MCU", "MS", "MLS", "LS", "WS", "EWS", "OTS", "POV"] as const;
export const CAMERA_MOVEMENT = [
  "static",
  "pan_left",
  "pan_right",
  "tilt_up",
  "tilt_down",
  "dolly_in",
  "dolly_out",
  "truck_left",
  "truck_right",
  "crane_up",
  "crane_down",
  "orbit_cw",
  "orbit_ccw",
  "push_in",
  "pull_out",
  "handheld",
  "gimbal_walk",
  "whip_pan",
] as const;
export const LIGHTING_KEY = [
  "high_key",
  "low_key",
  "natural",
  "golden_hour",
  "blue_hour",
  "neon",
  "practical",
  "motivated",
  "soft",
  "hard",
  "rim",
] as const;
export const LENS_MM = [14, 24, 35, 50, 85, 135, 200] as const;
export const DEPTH_OF_FIELD = ["shallow", "deep", "rack_focus"] as const;
export const COLOR_TEMPERATURE = ["tungsten", "daylight", "mixed", "monochrome"] as const;
export const NARRATIVE_ROLE = [
  "hook",
  "setup",
  "inciting_incident",
  "rising_action",
  "beat_drop",
  "climax",
  "falling_action",
  "resolution",
  "tag",
  "transition",
] as const;
export const ASSET_SOURCE = ["generated", "stock", "captured", "supplied"] as const;

export const RenderRuntimeSchema = z.enum(RENDER_RUNTIME);
export const RendererFamilySchema = z.enum(RENDERER_FAMILY);
export const AudioArchitectureSchema = z.enum(AUDIO_ARCHITECTURE);
export const ShotSizeSchema = z.enum(SHOT_SIZE);
export const CameraMovementSchema = z.enum(CAMERA_MOVEMENT);
export const LightingKeySchema = z.enum(LIGHTING_KEY);
export const LensMmSchema = z.union([
  z.literal(14),
  z.literal(24),
  z.literal(35),
  z.literal(50),
  z.literal(85),
  z.literal(135),
  z.literal(200),
]);
export const DepthOfFieldSchema = z.enum(DEPTH_OF_FIELD);
export const ColorTemperatureSchema = z.enum(COLOR_TEMPERATURE);
export const NarrativeRoleSchema = z.enum(NARRATIVE_ROLE);
export const AssetSourceSchema = z.enum(ASSET_SOURCE);

export type RenderRuntime = z.infer<typeof RenderRuntimeSchema>;
export type RendererFamily = z.infer<typeof RendererFamilySchema>;
export type AudioArchitecture = z.infer<typeof AudioArchitectureSchema>;
export type ShotSize = z.infer<typeof ShotSizeSchema>;
export type CameraMovement = z.infer<typeof CameraMovementSchema>;
export type LightingKey = z.infer<typeof LightingKeySchema>;
export type LensMm = z.infer<typeof LensMmSchema>;
export type DepthOfField = z.infer<typeof DepthOfFieldSchema>;
export type ColorTemperature = z.infer<typeof ColorTemperatureSchema>;
export type NarrativeRole = z.infer<typeof NarrativeRoleSchema>;
export type AssetSource = z.infer<typeof AssetSourceSchema>;
