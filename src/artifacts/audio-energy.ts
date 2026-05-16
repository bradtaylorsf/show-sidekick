import path from "node:path";
import { z } from "zod";
import { atomicWrite } from "../checkpoints/io.js";
import { projectDir } from "../checkpoints/paths.js";
import { loadJson } from "../config/loader.js";

export const AudioEnergyRawPointSchema = z.object({
  time_s: z.number().nonnegative(),
  momentary_lufs: z.number(),
  is_silence: z.boolean().optional(),
});

export const AudioEnergyProfileWindowSchema = z
  .object({
    start_s: z.number().nonnegative(),
    end_s: z.number().nonnegative(),
    rms: z.number().nonnegative(),
    lufs: z.number(),
  })
  .refine((window) => window.end_s >= window.start_s, {
    message: "energy window end_s must be greater than or equal to start_s",
    path: ["end_s"],
  });

export const AudioEnergyBestWindowSchema = z
  .object({
    start_s: z.number().nonnegative(),
    end_s: z.number().nonnegative(),
    average_lufs: z.number().optional(),
    peak_lufs: z.number().optional(),
  })
  .refine((window) => window.end_s >= window.start_s, {
    message: "best_window end_s must be greater than or equal to start_s",
    path: ["end_s"],
  });

export const AudioEnergySchema = z.object({
  source: z.enum(["ffmpeg-ebur128", "pcm-rms", "manual"]),
  raw_points: z.array(AudioEnergyRawPointSchema),
  energy_profile: z.array(AudioEnergyProfileWindowSchema),
  first_active_s: z.number().nonnegative().nullable(),
  peak_s: z.number().nonnegative().nullable(),
  recommended_offset_s: z.number().nonnegative(),
  best_window: AudioEnergyBestWindowSchema.nullable(),
  silence_threshold_lufs: z.number().optional(),
  analysis_window_s: z.number().positive().optional(),
  astats: z.record(z.unknown()).optional(),
  rms_windows: z.array(AudioEnergyProfileWindowSchema).optional(),
});

export type AudioEnergyRawPoint = z.infer<typeof AudioEnergyRawPointSchema>;
export type AudioEnergyProfileWindow = z.infer<typeof AudioEnergyProfileWindowSchema>;
export type AudioEnergyBestWindow = z.infer<typeof AudioEnergyBestWindowSchema>;
export type AudioEnergy = z.infer<typeof AudioEnergySchema>;

export function audioEnergyPath(projectRoot: string, show: string, episode: string): string {
  return path.join(projectDir(projectRoot, show, episode), "audio_energy.json");
}

export async function writeAudioEnergy(
  projectRoot: string,
  show: string,
  episode: string,
  audioEnergy: AudioEnergy,
): Promise<string> {
  const parsed = AudioEnergySchema.parse(audioEnergy);
  const filePath = audioEnergyPath(projectRoot, show, episode);

  await atomicWrite(filePath, `${JSON.stringify(parsed, null, 2)}\n`);

  return filePath;
}

export async function readAudioEnergy(projectRoot: string, show: string, episode: string): Promise<AudioEnergy> {
  return loadJson(audioEnergyPath(projectRoot, show, episode), AudioEnergySchema);
}
