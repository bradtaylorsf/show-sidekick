import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import {
  DuckingSchema,
  defaultRunCli,
  ensureOutputDir,
  formatFilterNumber,
  resolveProjectPath,
  resolveToolRunPath,
} from "../tool-support/audio-processing.js";
import type { Ducking } from "../tool-support/audio-processing.js";

const sfxSchema = z.object({
  path: z.string().min(1),
  start_s: z.number().nonnegative(),
  volume_db: z.number().optional(),
});

const inputSchema = z
  .object({
    narration_path: z.string().min(1).optional(),
    music_path: z.string().min(1).optional(),
    sfx: z.array(sfxSchema).default([]),
    ducking: DuckingSchema.optional(),
    output_path: z.string().min(1).optional(),
  })
  .superRefine((value, ctx) => {
    if (!value.narration_path && !value.music_path && value.sfx.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "audio_mixer requires narration_path, music_path, or at least one sfx item",
      });
    }
  });

const outputSchema = z.object({
  audio_path: z.string(),
  cost_usd: z.number(),
});

type AudioMixerInput = z.infer<typeof inputSchema>;
type DuckingConfig = {
  threshold_db: number;
  reduction_db: number;
  attack_ms: number;
  release_ms: number;
};

const DEFAULT_DUCKING: DuckingConfig = {
  threshold_db: -24,
  reduction_db: 12,
  attack_ms: 10,
  release_ms: 200,
};

export default defineTool({
  name: "audio_mixer",
  capability: "audio_processing",
  provider: "local",
  status: "beta",
  integration: { kind: "binary", binary: "ffmpeg", install: "brew install ffmpeg" },
  best_for: "Combining narration, music beds, and timed SFX with optional narration-driven music ducking.",
  supports: ["narration-mix", "music-ducking", "sfx", "ffmpeg"],
  cost: { unit: "call", usd: 0 },
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const outputPath = input.output_path
      ? resolveProjectPath(input.output_path, ctx.projectRoot)
      : resolveToolRunPath(ctx.projectRoot, "audio_mixer", "mix.wav");
    const { inputArgs, filterGraph } = buildMixerGraph(input, ctx.projectRoot);
    const runner = ctx.runCli ?? defaultRunCli;

    await ensureOutputDir(outputPath);
    await runner("ffmpeg", ["-y", ...inputArgs, "-filter_complex", filterGraph, "-map", "[mix]", outputPath], {
      cwd: ctx.projectRoot,
    });

    return outputSchema.parse({ audio_path: outputPath, cost_usd: 0 });
  },
});

function buildMixerGraph(input: AudioMixerInput, projectRoot: string): { inputArgs: string[]; filterGraph: string } {
  const inputArgs: string[] = [];
  const filters: string[] = [];
  const sfxLabels: string[] = [];
  let inputIndex = 0;
  let narrationBaseLabel: string | undefined;
  let narrationMixLabel: string | undefined;
  let narrationSidechainLabel: string | undefined;
  let musicLabel: string | undefined;

  if (input.narration_path) {
    inputArgs.push("-i", resolveProjectPath(input.narration_path, projectRoot));
    narrationBaseLabel = "narration_base";
    filters.push(`[${inputIndex}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[${narrationBaseLabel}]`);
    inputIndex += 1;
  }

  if (input.music_path) {
    inputArgs.push("-i", resolveProjectPath(input.music_path, projectRoot));
    musicLabel = "music";
    filters.push(`[${inputIndex}:a]aformat=sample_fmts=fltp:channel_layouts=stereo[${musicLabel}]`);
    inputIndex += 1;
  }

  input.sfx.forEach((sfx, index) => {
    inputArgs.push("-i", resolveProjectPath(sfx.path, projectRoot));
    const label = `sfx${index}`;
    const delayMs = Math.round(sfx.start_s * 1000);
    const volume = sfx.volume_db === undefined ? "" : `,volume=${formatFilterNumber(sfx.volume_db)}dB`;
    filters.push(`[${inputIndex}:a]adelay=${delayMs}|${delayMs}${volume},aformat=sample_fmts=fltp:channel_layouts=stereo[${label}]`);
    sfxLabels.push(label);
    inputIndex += 1;
  });

  const ducking = duckingConfig(input.ducking);
  if (ducking && narrationBaseLabel && musicLabel) {
    narrationMixLabel = "narration_mix";
    narrationSidechainLabel = "narration_sc";
    filters.push(`[${narrationBaseLabel}]asplit=2[${narrationMixLabel}][${narrationSidechainLabel}]`);
    const ratio = compressionRatio(ducking.reduction_db);
    filters.push(
      `[${musicLabel}][${narrationSidechainLabel}]sidechaincompress=threshold=${formatFilterNumber(
        ducking.threshold_db,
      )}dB:ratio=${formatFilterNumber(ratio)}:attack=${formatFilterNumber(ducking.attack_ms)}:release=${formatFilterNumber(
        ducking.release_ms,
      )}[ducked_music]`,
    );
    musicLabel = "ducked_music";
  } else {
    narrationMixLabel = narrationBaseLabel;
  }

  const mixInputs = [narrationMixLabel, musicLabel, ...sfxLabels].filter((label): label is string => label !== undefined);

  if (mixInputs.length === 1) {
    filters.push(`[${mixInputs[0]}]anull[mix]`);
  } else {
    filters.push(`${mixInputs.map((label) => `[${label}]`).join("")}amix=inputs=${mixInputs.length}:duration=longest:normalize=0[mix]`);
  }

  return { inputArgs, filterGraph: filters.join(";") };
}

function duckingConfig(ducking: Ducking | undefined): DuckingConfig | undefined {
  if (ducking === true) {
    return DEFAULT_DUCKING;
  }

  if (ducking === undefined || ducking === false) {
    return undefined;
  }

  if (!ducking.enabled) {
    return undefined;
  }

  return {
    threshold_db: ducking.threshold_db,
    reduction_db: ducking.reduction_db,
    attack_ms: ducking.attack_ms,
    release_ms: ducking.release_ms,
  };
}

function compressionRatio(reductionDb: number): number {
  return Math.max(1, Math.abs(reductionDb));
}
