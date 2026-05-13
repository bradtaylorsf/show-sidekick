import { z } from "zod";

export const PipelineRuntimeSchema = z.enum(["ffmpeg", "remotion", "hyperframes"]);

export const PipelineConfigSchema = z.object({
  playbook: z.string().optional(),
  runtime: PipelineRuntimeSchema.optional(),
  aspect: z.string().optional(),
  budget_usd: z.number().positive().optional(),
  playbook_overrides: z.string().optional(),
});

export type PipelineRuntime = z.infer<typeof PipelineRuntimeSchema>;
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
