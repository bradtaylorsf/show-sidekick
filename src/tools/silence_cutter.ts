import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import type { ToolCommandRunner } from "../registry/tool.js";
import {
  defaultRunCli,
  ensureOutputDir,
  formatFilterNumber,
  resolveOutputPath,
  resolveProjectPath,
} from "../tool-support/audio-processing.js";

const inputSchema = z.object({
  video_path: z.string().min(1),
  output_path: z.string().min(1).optional(),
  threshold_db: z.number().default(-30),
  min_silence_s: z.number().positive().default(0.5),
  padding_s: z.number().nonnegative().default(0.1),
});

const outputSchema = z.object({
  video_path: z.string(),
  duration_before_s: z.number().nonnegative(),
  duration_after_s: z.number().nonnegative(),
  reduction_ratio: z.number().nonnegative(),
  cost_usd: z.number(),
});

type SilenceInterval = {
  start: number;
  end: number;
};

type KeepRange = {
  start: number;
  end: number;
};

export default defineTool({
  name: "silence_cutter",
  capability: "audio_processing",
  provider: "local",
  status: "beta",
  integration: { kind: "binary", binary: "ffmpeg", install: "brew install ffmpeg" },
  best_for: "Trimming long speech pauses from talking-head footage while preserving a little padding around spoken sections.",
  supports: ["silence-detect", "talking-head-trim", "ffmpeg"],
  cost: { unit: "call", usd: 0 },
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const inputPath = resolveProjectPath(input.video_path, ctx.projectRoot);
    const outputPath = resolveOutputPath(input.output_path, inputPath, ctx.projectRoot, {
      toolDir: "silence_cutter",
      suffix: "-cut",
    });
    const runner = ctx.runCli ?? defaultRunCli;
    const durationBefore = await probeDuration(runner, inputPath, ctx.projectRoot);
    const silenceOutput = await runner(
      "ffmpeg",
      [
        "-hide_banner",
        "-i",
        inputPath,
        "-af",
        `silencedetect=noise=${formatFilterNumber(input.threshold_db)}dB:d=${formatFilterNumber(input.min_silence_s)}`,
        "-f",
        "null",
        "-",
      ],
      { cwd: ctx.projectRoot },
    );
    const intervals = parseSilenceIntervals(silenceOutput.stderr, durationBefore);
    const keepRanges = computeKeepRanges(intervals, durationBefore, input.padding_s);
    const estimatedDurationAfter = keepRanges.reduce((sum, range) => sum + range.end - range.start, 0) || durationBefore;

    await ensureOutputDir(outputPath);

    if (shouldCopyWithoutCuts(keepRanges, durationBefore)) {
      await runner("ffmpeg", ["-y", "-i", inputPath, "-c", "copy", outputPath], { cwd: ctx.projectRoot });
    } else {
      const filterGraph = buildTrimGraph(keepRanges);
      await runner(
        "ffmpeg",
        ["-y", "-i", inputPath, "-filter_complex", filterGraph, "-map", "[outv]", "-map", "[outa]", outputPath],
        { cwd: ctx.projectRoot },
      );
    }

    const durationAfter = await probeDuration(runner, outputPath, ctx.projectRoot, estimatedDurationAfter);
    const reductionRatio = durationBefore === 0 ? 0 : roundMetric((durationBefore - durationAfter) / durationBefore);

    return outputSchema.parse({
      video_path: outputPath,
      duration_before_s: roundMetric(durationBefore),
      duration_after_s: roundMetric(durationAfter),
      reduction_ratio: Math.max(0, reductionRatio),
      cost_usd: 0,
    });
  },
});

function parseSilenceIntervals(stderr: string, duration: number): SilenceInterval[] {
  const intervals: SilenceInterval[] = [];
  let pendingStart: number | undefined;

  for (const line of stderr.split(/\r?\n/)) {
    const start = /silence_start:\s*([0-9.]+)/.exec(line);
    if (start) {
      pendingStart = clamp(Number(start[1]), 0, duration);
    }

    const end = /silence_end:\s*([0-9.]+)/.exec(line);
    if (end && pendingStart !== undefined) {
      const intervalEnd = clamp(Number(end[1]), 0, duration);
      if (intervalEnd > pendingStart) {
        intervals.push({ start: pendingStart, end: intervalEnd });
      }
      pendingStart = undefined;
    }
  }

  if (pendingStart !== undefined && duration > pendingStart) {
    intervals.push({ start: pendingStart, end: duration });
  }

  return intervals;
}

function computeKeepRanges(intervals: SilenceInterval[], duration: number, padding: number): KeepRange[] {
  if (intervals.length === 0) {
    return [{ start: 0, end: duration }];
  }

  const ranges: KeepRange[] = [];
  let cursor = 0;

  for (const interval of intervals.sort((left, right) => left.start - right.start)) {
    const removeStart = clamp(interval.start + padding, 0, duration);
    const removeEnd = clamp(interval.end - padding, 0, duration);

    if (removeEnd <= removeStart) {
      continue;
    }

    if (removeStart > cursor) {
      ranges.push({ start: cursor, end: removeStart });
    }

    cursor = Math.max(cursor, removeEnd);
  }

  if (cursor < duration) {
    ranges.push({ start: cursor, end: duration });
  }

  return ranges.filter((range) => range.end - range.start > 0.001);
}

function buildTrimGraph(keepRanges: KeepRange[]): string {
  const filters: string[] = [];

  keepRanges.forEach((range, index) => {
    filters.push(
      `[0:v]trim=start=${formatFilterNumber(range.start)}:end=${formatFilterNumber(range.end)},setpts=PTS-STARTPTS[v${index}]`,
    );
    filters.push(
      `[0:a]atrim=start=${formatFilterNumber(range.start)}:end=${formatFilterNumber(range.end)},asetpts=PTS-STARTPTS[a${index}]`,
    );
  });

  filters.push(`${keepRanges.map((_range, index) => `[v${index}][a${index}]`).join("")}concat=n=${keepRanges.length}:v=1:a=1[outv][outa]`);

  return filters.join(";");
}

async function probeDuration(
  runner: ToolCommandRunner,
  path: string,
  projectRoot: string,
  fallback?: number,
): Promise<number> {
  const result = await runner(
    "ffprobe",
    ["-v", "error", "-show_entries", "format=duration", "-of", "default=noprint_wrappers=1:nokey=1", path],
    { cwd: projectRoot },
  );
  const parsed = Number(result.stdout.trim());

  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`ffprobe did not return a valid duration for ${path}`);
}

function shouldCopyWithoutCuts(keepRanges: KeepRange[], duration: number): boolean {
  return keepRanges.length === 1 && keepRanges[0]?.start === 0 && keepRanges[0]?.end === duration;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function roundMetric(value: number): number {
  return Number(value.toFixed(6));
}
