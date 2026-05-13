import { z } from "zod";
import { RenderRuntimeSchema } from "./enums.js";

export const FINAL_REVIEW_THRESHOLDS = {
  visual_frames_sampled_min: 4,
  caption_sync_accuracy_pass: 0.95,
  caption_sync_accuracy_critical_below: 0.8,
  subtitle_accuracy_pass: 0.95,
  subtitle_accuracy_critical_below: 0.8,
  motion_ratio_pass: 0.7,
  motion_ratio_critical_below: 0.5,
  word_accuracy_pass: 0.8,
} as const;

export const FinalReviewSchema = z.object({
  status: z.enum(["pass", "revise", "fail"]),
  recommended_action: z.enum(["present_to_user", "re_render", "revise_edit", "revise_assets", "block"]),
  checks: z.object({
    technical_probe: z.object({
      container: z.string(),
      duration_s: z.number().nonnegative(),
      duration_promised_s: z.number().nonnegative(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      framerate: z.number().positive(),
      video_codec: z.string(),
      audio_codec: z.string(),
      audio_channels: z.number().int().nonnegative(),
      bitrate_kbps: z.number().nonnegative(),
      verdict: z.enum(["pass", "warn", "fail"]),
    }),
    visual_spotcheck: z.object({
      frames_sampled: z.number().int().min(0),
      frame_paths: z.array(z.string()).optional(),
      sample_points_pct: z.array(z.number().min(0).max(100)).optional(),
      hero_frame_path: z.string().optional(),
      matched_elements: z.array(z.string()).optional(),
      findings: z.array(z.unknown()).default([]),
    }),
    audio_spotcheck: z.object({
      narration_present: z.boolean(),
      music_present: z.boolean(),
      caption_sync_accuracy: z.number().min(0).max(1),
      findings: z.array(z.unknown()).default([]),
    }),
    promise_preservation: z.object({
      delivery_promise_honored: z.boolean(),
      silent_downgrade_detected: z.boolean(),
      runtime_swap_detected: z.boolean(),
      runtime_swap_check: z.string(),
      motion_ratio_actual: z.number().min(0).max(1),
      render_runtime_used: RenderRuntimeSchema,
      findings: z.array(z.unknown()).default([]),
    }),
    subtitle_check: z.object({
      present: z.boolean(),
      accuracy_within_150ms: z.number().min(0).max(1),
    }),
    transcript_comparison: z
      .object({
        word_accuracy: z.number().min(0).max(1),
        missing_words_pct: z.number().min(0).max(100),
      })
      .optional(),
  }),
  issues_found: z.array(z.unknown()).default([]),
});

export type FinalReview = z.infer<typeof FinalReviewSchema>;
