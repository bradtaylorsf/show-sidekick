import { z } from "zod";

export const DECISION_CATEGORY = [
  "pipeline_selection",
  "provider_selection",
  "model_selection",
  "renderer_family_selection",
  "render_runtime_selection",
  "playbook_selection",
  "playbook_override",
  "music_source",
  "motion_commitment",
  "voice_selection",
  "concept_selection",
  "fallback_decision",
  "downgrade_approval",
  "budget_tradeoff",
  "capability_extension",
  "provider_profile_selection",
  "visual_accuracy_check",
] as const;

export const DecisionCategorySchema = z.enum(DECISION_CATEGORY);

export const DecisionEntrySchema = z.object({
  id: z.string(),
  stage: z.string(),
  timestamp: z.string(),
  category: DecisionCategorySchema,
  scope: z
    .object({
      capability: z.string().optional(),
      provider: z.string().optional(),
    })
    .optional(),
  options_considered: z
    .array(
      z.object({
        label: z.string(),
        rejected_because: z.string().nullable(),
        notes: z.string().nullable().optional(),
      }),
    )
    .min(2),
  picked: z.string(),
  reason: z.string().min(1),
  confidence: z.number().min(0).max(1),
  user_visible: z.boolean(),
  supersedes: z.string().nullable(),
});

export const DecisionLogSchema = z.array(DecisionEntrySchema);

export type DecisionCategory = z.infer<typeof DecisionCategorySchema>;
export type DecisionEntry = z.infer<typeof DecisionEntrySchema>;
export type DecisionLog = z.infer<typeof DecisionLogSchema>;
