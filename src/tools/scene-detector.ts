import { execFile } from "node:child_process";
import { z } from "zod";
import { defineTool } from "../registry/index.js";
import { errorWithInstallHint } from "../tool-support/errors.js";
import { resolveProjectReadPath } from "../tool-support/paths.js";

const INSTALL = "brew install ffmpeg";

const inputSchema = z.object({
  path: z.string().min(1),
  threshold: z.number().min(0).max(1).default(0.3),
});

const sceneSchema = z.object({
  index: z.number().int().min(0),
  start_s: z.number(),
  end_s: z.number(),
});

const outputSchema = z.object({
  scenes: z.array(sceneSchema),
});

type SceneDetectorInput = z.infer<typeof inputSchema>;
type SceneDetectorOutput = z.infer<typeof outputSchema>;

export function parseSceneCutTimes(log: string): number[] {
  const times = new Set<number>();
  const regex = /pts_time[:=](-?\d+(?:\.\d+)?)/g;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(log)) !== null) {
    const time = Number(match[1]);
    if (Number.isFinite(time) && time >= 0) {
      times.add(time);
    }
  }

  return [...times].sort((left, right) => left - right);
}

export function buildScenes(durationS: number, cutTimes: number[]): SceneDetectorOutput {
  const duration = Math.max(0, durationS);
  const cuts = cutTimes.filter((time) => time > 0 && time < duration).sort((left, right) => left - right);
  const boundaries = [0, ...cuts, duration];
  const scenes = [];

  for (let index = 0; index < boundaries.length - 1; index += 1) {
    scenes.push({
      index,
      start_s: boundaries[index] as number,
      end_s: boundaries[index + 1] as number,
    });
  }

  if (scenes.length === 0) {
    scenes.push({ index: 0, start_s: 0, end_s: duration });
  }

  return { scenes };
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

const sceneDetector = defineTool({
  name: "scene_detector",
  capability: "scene_detection",
  provider: "ffmpeg",
  status: "beta",
  integration: {
    kind: "binary",
    binary: "ffmpeg",
    install: INSTALL,
  },
  best_for: "fast cut boundary detection for source media review and clip window selection",
  supports: ["scene-cut-detection", "ffmpeg-scene-score"],
  input: inputSchema,
  output: outputSchema,
  async execute(params: SceneDetectorInput, ctx): Promise<SceneDetectorOutput> {
    const input = inputSchema.parse(params);
    const inputPath = resolveProjectReadPath(input.path, ctx.projectRoot);
    const duration = await probeDuration(inputPath);
    const result = await runFile("ffmpeg", [
      "-hide_banner",
      "-nostats",
      "-i",
      inputPath,
      "-vf",
      `select=gt(scene\\,${input.threshold}),metadata=print:file=-`,
      "-an",
      "-f",
      "null",
      "-",
    ]);
    const cutTimes = parseSceneCutTimes(`${result.stdout}\n${result.stderr}`);

    return outputSchema.parse(buildScenes(duration, cutTimes));
  },
});

export default sceneDetector;
