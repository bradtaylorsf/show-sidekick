import { z } from "zod";

export const PipelineRuntimeSchema = z.enum(["ffmpeg", "remotion", "hyperframes"]);
export const PipelineCaptureModeSchema = z.enum(["synthetic_terminal"]);

export const PipelineConfigSchema = z.object({
  playbook: z.string().optional(),
  runtime: PipelineRuntimeSchema.optional(),
  aspect: z.string().optional(),
  budget_usd: z.number().positive().optional(),
  playbook_overrides: z.string().optional(),
  capture_mode: PipelineCaptureModeSchema.optional(),
});

export type PipelineRuntime = z.infer<typeof PipelineRuntimeSchema>;
export type PipelineCaptureMode = z.infer<typeof PipelineCaptureModeSchema>;
export type PipelineConfig = z.infer<typeof PipelineConfigSchema>;
