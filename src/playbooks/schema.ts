import { z } from "zod";

export const FontSpecSchema = z.object({
  font: z.string(),
  weight: z.number().int().optional(),
  tracking: z.string().optional(),
  line_height: z.number().optional(),
  size_multiplier: z.number().optional(),
});

export const PlaybookColorPaletteSchema = z.object({
  primary: z.array(z.string()).min(1),
  accent: z.array(z.string()).min(1),
  background: z.string(),
  text: z.string(),
  muted: z.string().optional(),
});

export const PlaybookPacingRulesSchema = z.object({
  min_scene_hold_seconds: z.number().min(0.5),
  max_scene_hold_seconds: z.number().min(1),
  text_card_hold_seconds: z.number().min(1).optional(),
  stat_card_hold_seconds: z.number().min(1).optional(),
  transition_duration_seconds: z.number().min(0.1).optional(),
});

export const BundledPlaybookSchema = z
  .object({
    identity: z.object({
      name: z.string(),
      category: z.enum(["motion-graphics", "whiteboard", "cinematic", "minimalist", "retro", "anime-illustration", "custom"]),
      mood: z.string(),
      pace: z.enum(["slow", "gentle", "deliberate", "moderate", "fast", "rapid"]),
      best_for: z.string().optional(),
    }),
    visual_language: z.object({
      color_palette: PlaybookColorPaletteSchema,
      composition: z.string(),
      texture: z.string(),
    }),
    typography: z.object({
      headings: FontSpecSchema,
      body: FontSpecSchema,
      code: FontSpecSchema.optional(),
      stat_card: FontSpecSchema.optional(),
      scale_system: z.union([z.string(), z.number()]).optional(),
      weight_matrix: z
        .object({
          title: z.number().int().min(100).max(900).optional(),
          heading: z.number().int().min(100).max(900).optional(),
          body: z.number().int().min(100).max(900).optional(),
          caption: z.number().int().min(100).max(900).optional(),
        })
        .optional(),
    }),
    motion: z.object({
      transitions: z.array(z.string()).min(1),
      animation_style: z.string(),
      pacing_rules: PlaybookPacingRulesSchema,
      entrance: z.string().optional(),
      exit: z.string().optional(),
    }),
    audio: z.object({
      voice_style: z.string(),
      music_mood: z.string(),
      music_volume: z.number().min(0).max(1),
      sfx_style: z.string().optional(),
      ducking_threshold_db: z.number().optional(),
      voice_variation_allowed: z.boolean().optional(),
      hero_moment_voice_shift: z.string().optional(),
      transition_voice_shift: z.string().optional(),
    }),
    asset_generation: z.object({
      image_prompt_prefix: z.string(),
      image_negative_prompt: z.string().optional(),
      diagram_style: z.string().optional(),
      consistency_anchors: z.array(z.string()).min(1),
    }),
    quality_rules: z.array(z.string()).min(1),
    chart_palette: z.array(z.string()).min(2).optional(),
    color_rules: z
      .object({
        harmony_type: z.enum(["complementary", "analogous", "triadic", "split-complementary"]).optional(),
        contrast_validation: z.boolean().optional(),
        colorblind_safe: z.boolean().optional(),
      })
      .optional(),
    palette: z.array(z.string()).optional(),
    transitions_allowed: z.array(z.string()).optional(),
    pacing: z
      .object({
        min_scene_s: z.number().nonnegative(),
        max_scene_s: z.number().positive(),
      })
      .optional(),
    style_cues: z.array(z.string()).optional(),
  })
  .superRefine((playbook, ctx) => {
    const pacing = playbook.motion.pacing_rules;
    if (pacing.max_scene_hold_seconds < pacing.min_scene_hold_seconds) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["motion", "pacing_rules", "max_scene_hold_seconds"],
        message: "max_scene_hold_seconds must be greater than or equal to min_scene_hold_seconds",
      });
    }

    if (playbook.pacing && playbook.pacing.max_scene_s < playbook.pacing.min_scene_s) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["pacing", "max_scene_s"],
        message: "pacing.max_scene_s must be greater than or equal to pacing.min_scene_s",
      });
    }
  });

export type BundledPlaybook = z.infer<typeof BundledPlaybookSchema>;
