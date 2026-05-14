import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/index.js";
import { errorWithInstallHint } from "../tool-support/errors.js";
import { resolveProjectReadPath, resolveProjectWritePath } from "../tool-support/paths.js";
import { parseSceneCutTimes } from "./scene-detector.js";

const INSTALL = "brew install ffmpeg";

const inputSchema = z.object({
  path: z.string().min(1),
  count: z.number().int().positive(),
  mode: z.enum(["uniform", "scene_aware"]).default("uniform"),
  output_dir: z.string().min(1),
});

const sampledFrameSchema = z.object({
  index: z.number().int().min(0),
  time_s: z.number(),
  path: z.string(),
});

const outputSchema = z.object({
  frames: z.array(sampledFrameSchema),
});

type FrameSamplerInput = z.infer<typeof inputSchema>;
type FrameSamplerOutput = z.infer<typeof outputSchema>;

export function uniformSampleTimes(durationS: number, count: number): number[] {
  if (count <= 0) {
    return [];
  }

  if (durationS <= 0) {
    return Array.from({ length: count }, () => 0);
  }

  return Array.from({ length: count }, (_value, index) => {
    const midpoint = ((index + 0.5) / count) * durationS;
    return Math.min(durationS, Math.max(0, midpoint));
  });
}

export function mergeSceneAwareSampleTimes(durationS: number, count: number, cuts: number[]): number[] {
  const sceneTimes = cuts.filter((time) => time >= 0 && time <= durationS).slice(0, count);

  if (sceneTimes.length >= count) {
    return sceneTimes;
  }

  const seen = new Set(sceneTimes.map((time) => time.toFixed(3)));
  const fallback = uniformSampleTimes(durationS, count).filter((time) => !seen.has(time.toFixed(3)));

  return [...sceneTimes, ...fallback].slice(0, count);
}

export function framePath(outputDir: string, index: number): string {
  return join(outputDir, `frame_${String(index).padStart(4, "0")}.png`);
}

async function runFile(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(errorWithInstallHint(error, INSTALL));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

async function probeDuration(path: string): Promise<number> {
  const result = await runFile("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const duration = Number(result.stdout.trim());
  return Number.isFinite(duration) ? duration : 0;
}

async function detectCutTimes(path: string): Promise<number[]> {
  const result = await runFile("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-i",
    path,
    "-vf",
    "select=gt(scene\\,0.3),metadata=print:file=-",
    "-an",
    "-f",
    "null",
    "-",
  ]);

  return parseSceneCutTimes(`${result.stdout}\n${result.stderr}`);
}

const frameSampler = defineTool({
  name: "frame_sampler",
  capability: "frame_sampling",
  provider: "ffmpeg",
  status: "beta",
  integration: {
    kind: "binary",
    binary: "ffmpeg",
    install: INSTALL,
  },
  best_for: "uniform or scene-aware still-frame sampling from local video clips",
  supports: ["uniform-sampling", "scene-aware-sampling", "png-output"],
  input: inputSchema,
  output: outputSchema,
  async execute(params: FrameSamplerInput, ctx): Promise<FrameSamplerOutput> {
    const input = inputSchema.parse(params);
    const inputPath = resolveProjectReadPath(input.path, ctx.projectRoot);
    const outputDir = resolveProjectWritePath(input.output_dir, ctx.projectRoot);
    await mkdir(outputDir, { recursive: true });

    const duration = await probeDuration(inputPath);
    const cuts = input.mode === "scene_aware" ? await detectCutTimes(inputPath) : [];
    const times =
      input.mode === "scene_aware"
        ? mergeSceneAwareSampleTimes(duration, input.count, cuts)
        : uniformSampleTimes(duration, input.count);

    const frames: FrameSamplerOutput["frames"] = [];

    for (const [index, time] of times.entries()) {
      const outputPath = framePath(outputDir, index);
      await runFile("ffmpeg", ["-hide_banner", "-y", "-ss", String(time), "-i", inputPath, "-frames:v", "1", outputPath]);
      frames.push({ index, time_s: time, path: outputPath });
    }

    return outputSchema.parse({ frames });
  },
});

export default frameSampler;
