import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import {
  defaultRunCli,
  ensureOutputDir,
  formatFilterNumber,
  resolveOutputPath,
  resolveProjectPath,
} from "../tool-support/audio-processing.js";

const eqSchema = z.object({
  low_db: z.number().optional(),
  mid_db: z.number().optional(),
  high_db: z.number().optional(),
});

const inputSchema = z.object({
  audio_path: z.string().min(1),
  output_path: z.string().min(1).optional(),
  noise_reduction: z.boolean().default(true),
  normalize: z.boolean().default(true),
  eq: eqSchema.optional(),
});

const outputSchema = z.object({
  audio_path: z.string(),
  cost_usd: z.number(),
});

type AudioEnhanceInput = z.infer<typeof inputSchema>;

export default defineTool({
  name: "audio_enhance",
  capability: "audio_processing",
  provider: "local",
  status: "beta",
  integration: { kind: "binary", binary: "ffmpeg", install: "brew install ffmpeg" },
  best_for: "Cleaning narration and source audio with ffmpeg noise reduction, loudness normalization, and broad EQ.",
  supports: ["noise-reduction", "loudness-normalization", "eq", "ffmpeg"],
  cost: { unit: "call", usd: 0 },
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const inputPath = resolveProjectPath(input.audio_path, ctx.projectRoot);
    const outputPath = resolveOutputPath(input.output_path, inputPath, ctx.projectRoot, {
      toolDir: "audio_enhance",
      suffix: "-enhanced",
    });
    const filters = buildEnhancementFilters(input);
    const runner = ctx.runCli ?? defaultRunCli;
    const args = ["-y", "-i", inputPath];

    if (filters.length > 0) {
      args.push("-af", filters.join(","));
    } else {
      args.push("-c:a", "copy");
    }

    args.push("-vn", outputPath);
    await ensureOutputDir(outputPath);
    await runner("ffmpeg", args, { cwd: ctx.projectRoot });

    return outputSchema.parse({ audio_path: outputPath, cost_usd: 0 });
  },
});

function buildEnhancementFilters(input: AudioEnhanceInput): string[] {
  const filters: string[] = [];

  if (input.noise_reduction) {
    filters.push("afftdn");
  }

  if (input.normalize) {
    filters.push("loudnorm=I=-16:TP=-1.5:LRA=11");
  }

  if (input.eq?.low_db !== undefined) {
    filters.push(eqFilter(100, input.eq.low_db));
  }

  if (input.eq?.mid_db !== undefined) {
    filters.push(eqFilter(1000, input.eq.mid_db));
  }

  if (input.eq?.high_db !== undefined) {
    filters.push(eqFilter(10000, input.eq.high_db));
  }

  return filters;
}

function eqFilter(frequency: number, gainDb: number): string {
  return `equalizer=f=${frequency}:t=q:w=1:g=${formatFilterNumber(gainDb)}`;
}
