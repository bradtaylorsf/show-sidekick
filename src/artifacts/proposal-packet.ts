import { z } from "zod";
import { AudioArchitectureSchema, RendererFamilySchema, RenderRuntimeSchema } from "./enums.js";

export const ProposalPacketSchema = z.object({
  concept_options: z
    .array(
      z.object({
        slug: z.string(),
        hook: z.string(),
        treatment: z.string(),
      }),
    )
    .min(3),
  production_plan: z.object({
    render_runtime: RenderRuntimeSchema,
    renderer_family: RendererFamilySchema,
    audio_architecture: AudioArchitectureSchema,
    sample_required: z.boolean().optional(),
  }),
  delivery_promise: z.object({
    motion_led: z.boolean(),
    narration_present: z.boolean(),
    music_present: z.boolean(),
    reference_driven: z.boolean().optional(),
  }),
  decision_log_ref: z.string(),
});

export type ProposalPacket = z.infer<typeof ProposalPacketSchema>;
