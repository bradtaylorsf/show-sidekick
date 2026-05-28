import { execFile } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import {
  AssetManifestSchema,
  EditDecisionsSchema,
  RenderReportSchema,
  type ClipTrimReport,
  type EditDecisions,
} from "../artifacts/index.js";
import { ffprobe, FfprobeResultSchema } from "../audio/ffprobe.js";
import { defineTool, type ToolContext } from "../registry/index.js";

const BaseOutputSchema = z.object({
  operation: z.string(),
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number().int(),
  output_path: z.string().optional(),
});

const SilenceSegmentSchema = z.object({
  start_s: z.number().nonnegative(),
  end_s: z.number().nonnegative(),
  duration_s: z.number().nonnegative(),
});

export const FfmpegInputSchema = z.discriminatedUnion("operation", [
  z.object({
    operation: z.literal("trim"),
    input: z.string(),
    output: z.string(),
    start_s: z.number().nonnegative(),
    end_s: z.number().positive(),
  }),
  z.object({
    operation: z.literal("concat"),
    inputs: z.array(z.string()).min(1),
    output: z.string(),
    transition: z.string().optional(),
  }),
  z.object({
    operation: z.literal("silence_detect"),
    input: z.string(),
    threshold_db: z.number().default(-30),
    min_silence_s: z.number().positive().default(0.5),
  }),
  z.object({
    operation: z.literal("probe"),
    input: z.string(),
  }),
  z.object({
    operation: z.literal("audio_extract"),
    input: z.string(),
    output: z.string(),
  }),
  z.object({
    operation: z.literal("normalize"),
    input: z.string(),
    output: z.string(),
    target_lufs: z.number().default(-16),
  }),
  z.object({
    operation: z.literal("compose"),
    edit_decisions: EditDecisionsSchema,
    asset_manifest: AssetManifestSchema,
    output_path: z.string().optional(),
    planned_duration_s: z.number().positive().optional(),
    drift_tolerance_frames: z.number().positive().optional(),
  }),
]);

export const FfmpegUtilityOutputSchema = BaseOutputSchema.extend({
  operation: z.enum(["trim", "concat", "silence_detect", "probe", "audio_extract", "normalize"]),
  silence_segments: z.array(SilenceSegmentSchema).optional(),
  probe: FfprobeResultSchema.optional(),
});

export const FfmpegOutputSchema = z.union([FfmpegUtilityOutputSchema, RenderReportSchema]);

export type FfmpegInput = z.infer<typeof FfmpegInputSchema>;
export type FfmpegUtilityOutput = z.infer<typeof FfmpegUtilityOutputSchema>;
export type FfmpegOutput = z.infer<typeof FfmpegOutputSchema>;
export type SilenceSegment = z.infer<typeof SilenceSegmentSchema>;

export class FfmpegError extends Error {
  readonly command: string[];
  readonly stderr: string;
  readonly stderr_excerpt: string;
  readonly exit_code: number | null;

  constructor(message: string, options: { command: string[]; stderr: string; exitCode: number | null; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "FfmpegError";
    this.command = options.command;
    this.stderr = options.stderr;
    this.stderr_excerpt = excerpt(options.stderr);
    this.exit_code = options.exitCode;
  }
}

const INSTALL_INSTRUCTIONS = `macOS: brew install ffmpeg
Linux: sudo apt-get update && sudo apt-get install ffmpeg
Windows: winget install Gyan.FFmpeg`;

export default defineTool({
  name: "ffmpeg",
  capability: "video_compose",
  provider: "ffmpeg",
  status: "production",
  integration: {
    kind: "binary",
    binary: "ffmpeg",
    install: INSTALL_INSTRUCTIONS,
  },
  best_for: "local video trimming, concatenation, audio extraction, silence detection, loudness normalization, and media probing",
  supports: ["trim", "concat", "silence-detect", "probe", "audio-extract", "normalize"],
  input: FfmpegInputSchema,
  output: FfmpegOutputSchema,

  async execute(params, ctx) {
    const input = FfmpegInputSchema.parse(params);

    if (input.operation === "trim" && input.end_s <= input.start_s) {
      throw new FfmpegError("trim end_s must be greater than start_s", {
        command: ["ffmpeg"],
        stderr: `invalid trim range: start_s=${input.start_s}, end_s=${input.end_s}`,
        exitCode: null,
      });
    }

    switch (input.operation) {
      case "trim":
        return runOutputOperation(input.operation, trimArgs(input), input.output);
      case "concat":
        return concat(input);
      case "silence_detect":
        return silenceDetect(input);
      case "probe":
        return probe(input.input);
      case "audio_extract":
        return runOutputOperation(input.operation, audioExtractArgs(input), input.output);
      case "normalize":
        return runOutputOperation(input.operation, normalizeArgs(input), input.output);
      case "compose":
        return compose(input, ctx);
    }
  },
});

function trimArgs(params: Extract<FfmpegInput, { operation: "trim" }>): string[] {
  return [
    "-y",
    "-hide_banner",
    "-ss",
    String(params.start_s),
    "-to",
    String(params.end_s),
    "-i",
    params.input,
    "-map",
    "0",
    "-c",
    "copy",
    params.output,
  ];
}

async function concat(params: Extract<FfmpegInput, { operation: "concat" }>): Promise<FfmpegOutput> {
  const dir = await mkdtemp(join(tmpdir(), "show-sidekick-ffmpeg-concat-"));
  const listPath = join(dir, "inputs.txt");

  try {
    await writeFile(listPath, params.inputs.map((input) => `file '${escapeConcatPath(input)}'`).join("\n"));
    return await runOutputOperation(
      params.operation,
      ["-y", "-hide_banner", "-f", "concat", "-safe", "0", "-i", listPath, "-c", "copy", params.output],
      params.output,
    );
  } finally {
    await rm(dir, { force: true, recursive: true });
  }
}

async function silenceDetect(params: Extract<FfmpegInput, { operation: "silence_detect" }>): Promise<FfmpegOutput> {
  const result = await runFfmpeg([
    "ffmpeg",
    "-hide_banner",
    "-i",
    params.input,
    "-af",
    `silencedetect=noise=${params.threshold_db}dB:d=${params.min_silence_s}`,
    "-f",
    "null",
    "-",
  ]);

  return {
    operation: params.operation,
    stdout: result.stdout,
    stderr: result.stderr,
    exit_code: result.exitCode,
    silence_segments: parseSilenceSegments(result.stderr),
  };
}

async function probe(input: string): Promise<FfmpegOutput> {
  const result = await ffprobe(input);

  return {
    operation: "probe",
    stdout: JSON.stringify(result),
    stderr: "",
    exit_code: 0,
    probe: result,
  };
}

function audioExtractArgs(params: Extract<FfmpegInput, { operation: "audio_extract" }>): string[] {
  return [
    "-y",
    "-hide_banner",
    "-i",
    params.input,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    params.output,
  ];
}

function normalizeArgs(params: Extract<FfmpegInput, { operation: "normalize" }>): string[] {
  return [
    "-y",
    "-hide_banner",
    "-i",
    params.input,
    "-af",
    `loudnorm=I=${params.target_lufs}:TP=-1.5:LRA=11`,
    params.output,
  ];
}

async function compose(
  params: Extract<FfmpegInput, { operation: "compose" }>,
  ctx: ToolContext,
): Promise<z.infer<typeof RenderReportSchema>> {
  const outputPath = resolveAssetPath(params.output_path ?? "renders/ffmpeg.mp4", ctx.projectRoot);
  const assetById = new Map(params.asset_manifest.assets.map((asset) => [asset.id, asset]));
  const cuts = [...params.edit_decisions.cuts].sort((left, right) => left.start_s - right.start_s);

  if (cuts.length === 0) {
    throw new FfmpegError("compose requires at least one cut", {
      command: ["ffmpeg"],
      stderr: "edit_decisions.cuts is empty",
      exitCode: null,
    });
  }

  const clipInfos = await Promise.all(
    cuts.map(async (cut) => {
      const asset = assetById.get(cut.asset_id);
      if (!asset) {
        throw new FfmpegError(`compose asset not found: ${cut.asset_id}`, {
          command: ["ffmpeg"],
          stderr: `asset_manifest does not contain ${cut.asset_id}`,
          exitCode: null,
        });
      }

      const path = resolveAssetPath(asset.path, ctx.projectRoot);
      const probe = await ffprobe(path);
      const video = probe.streams.find((stream) => stream.codec_type === "video" && stream.width && stream.height);
      if (!video?.width || !video.height) {
        throw new FfmpegError(`compose asset has no video stream: ${asset.path}`, {
          command: ["ffmpeg"],
          stderr: `asset ${asset.id} has no video stream`,
          exitCode: null,
        });
      }

      return {
        cut,
        path,
        duration_s: Math.max(0, cut.end_s - cut.start_s),
        source_duration_s: probe.format.duration_s,
        width: video.width,
        height: video.height,
        hasAudio: probe.streams.some((stream) => stream.codec_type === "audio"),
      };
    }),
  );

  const firstVideo = clipInfos[0];
  if (!firstVideo) {
    throw new Error("unreachable: compose requires at least one cut");
  }

  await mkdir(dirname(outputPath), { recursive: true });
  const externalAudioPath = audioTrackPath(params.edit_decisions);
  const externalAudioInput = externalAudioPath === undefined ? undefined : resolveAssetPath(externalAudioPath, ctx.projectRoot);
  const inputArgs = [
    ...clipInfos.flatMap((clip) => ["-i", clip.path]),
    ...(externalAudioInput === undefined ? [] : ["-i", externalAudioInput]),
  ];
  const { filter, videoLabel, audioLabel } = composeFilter(clipInfos, firstVideo, {
    useClipAudio: externalAudioInput === undefined && clipInfos.every((clip) => clip.hasAudio),
    externalAudioInputIndex: externalAudioInput === undefined ? undefined : clipInfos.length,
  });
  const result = await runFfmpeg([
    "ffmpeg",
    "-y",
    "-hide_banner",
    "-loglevel",
    "error",
    ...inputArgs,
    "-filter_complex",
    filter,
    "-map",
    videoLabel,
    ...(audioLabel ? ["-map", audioLabel] : ["-an"]),
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-pix_fmt",
    "yuv420p",
    ...(audioLabel ? ["-c:a", "aac"] : []),
    outputPath,
  ]);

  const outputProbe = await ffprobe(outputPath);
  const framerate = 30;
  const expectedDurationS = params.planned_duration_s ?? clipInfos.reduce((sum, clip) => sum + clip.duration_s, 0);
  const toleranceFrames = params.drift_tolerance_frames ?? 1;
  const driftToleranceS = toleranceFrames / framerate;
  const totalDrift = driftMetrics(expectedDurationS, outputProbe.format.duration_s, framerate, toleranceFrames);
  const clipTrims = clipInfos.map((clip) =>
    clipTrimReport(clip, framerate, toleranceFrames),
  );
  const driftStatus = validationStatus(totalDrift.drift_frames, toleranceFrames);

  return RenderReportSchema.parse({
    output_path: outputPath,
    encoding_profile: "ffmpeg/h264-aac",
    duration_s: outputProbe.format.duration_s,
    expected_duration_s: expectedDurationS,
    drift_s: totalDrift.drift_s,
    drift_frames: totalDrift.drift_frames,
    drift_tolerance_s: driftToleranceS,
    within_tolerance: totalDrift.within_tolerance,
    clip_trims: clipTrims,
    resolution: { width: firstVideo.width, height: firstVideo.height },
    framerate,
    runtime_used: "ffmpeg",
    asset_count: params.asset_manifest.assets.length,
    warnings: result.stderr.trim() ? [excerpt(result.stderr)] : [],
    validation_steps: [
      {
        name: "render_drift",
        status: driftStatus,
        notes: `expected=${expectedDurationS.toFixed(3)}s actual=${outputProbe.format.duration_s.toFixed(3)}s drift=${totalDrift.drift_frames.toFixed(2)} frames tolerance=${toleranceFrames.toFixed(2)} frames`,
      },
    ],
  });
}

type ComposeClip = {
  cut: EditDecisions["cuts"][number];
  path: string;
  duration_s: number;
  source_duration_s: number;
  width: number;
  height: number;
  hasAudio: boolean;
};

type ComposeFilterOptions = {
  useClipAudio: boolean;
  externalAudioInputIndex?: number;
};

function clipTrimReport(
  clip: ComposeClip,
  framerate: number,
  toleranceFrames: number,
): ClipTrimReport {
  const actualDurationS = frameAlignedDuration(clip.duration_s, framerate);
  const drift = driftMetrics(clip.duration_s, actualDurationS, framerate, toleranceFrames);

  return {
    asset_id: clip.cut.asset_id,
    requested_duration_s: roundSeconds(clip.duration_s),
    actual_duration_s: actualDurationS,
    drift_s: drift.drift_s,
    drift_frames: drift.drift_frames,
    within_tolerance: drift.within_tolerance,
  };
}

function driftMetrics(
  expectedDurationS: number,
  actualDurationS: number,
  framerate: number,
  toleranceFrames: number,
): { drift_s: number; drift_frames: number; within_tolerance: boolean } {
  const driftS = roundSeconds(Math.abs(actualDurationS - expectedDurationS));
  const driftFrames = roundFrames(driftS * framerate);

  return {
    drift_s: driftS,
    drift_frames: driftFrames,
    within_tolerance: driftFrames <= toleranceFrames + 1e-6,
  };
}

function validationStatus(driftFrames: number, toleranceFrames: number): "pass" | "warn" | "fail" {
  if (driftFrames > toleranceFrames + 1e-6) {
    return "fail";
  }

  return toleranceFrames > 1 && driftFrames > 1 ? "warn" : "pass";
}

function frameAlignedDuration(durationS: number, framerate: number): number {
  return roundSeconds(Math.round(durationS * framerate) / framerate);
}

function composeFilter(
  clips: ComposeClip[],
  firstVideo: Pick<ComposeClip, "width" | "height">,
  options: ComposeFilterOptions,
): { filter: string; videoLabel: string; audioLabel?: string } {
  const filters: string[] = [];
  const hasAudio = options.useClipAudio;

  clips.forEach((clip, index) => {
    const sourceDuration = clip.source_duration_s > 0 ? clip.source_duration_s : clip.duration_s;
    const trimDuration = Math.min(clip.duration_s, sourceDuration);
    const padDuration = Math.max(0, clip.duration_s - trimDuration);
    const videoFilters = [
      `trim=duration=${filterNumber(trimDuration)}`,
      "setpts=PTS-STARTPTS",
      `scale=${firstVideo.width}:${firstVideo.height}`,
      "setsar=1",
      "fps=30",
      "format=yuv420p",
      ...(padDuration > 0 ? [`tpad=stop_mode=clone:stop_duration=${filterNumber(padDuration)}`] : []),
    ];
    filters.push(`[${index}:v]${videoFilters.join(",")}[v${index}]`);

    if (hasAudio) {
      filters.push(
        `[${index}:a]atrim=duration=${filterNumber(clip.duration_s)},asetpts=PTS-STARTPTS,aresample=48000,apad=pad_dur=${filterNumber(clip.duration_s)},atrim=duration=${filterNumber(clip.duration_s)}[a${index}]`,
      );
    }
  });

  const inputs = clips.map((_clip, index) => (hasAudio ? `[v${index}][a${index}]` : `[v${index}]`)).join("");
  const totalDurationS = clips.reduce((sum, clip) => sum + clip.duration_s, 0);
  let videoLabel = "[v0]";
  let audioLabel = hasAudio ? "[a0]" : undefined;

  if (clips.length > 1) {
    filters.push(`${inputs}concat=n=${clips.length}:v=1:a=${hasAudio ? 1 : 0}[vout]${hasAudio ? "[aout]" : ""}`);
    videoLabel = "[vout]";
    audioLabel = hasAudio ? "[aout]" : undefined;
  }

  if (options.externalAudioInputIndex !== undefined) {
    filters.push(
      `[${options.externalAudioInputIndex}:a]atrim=duration=${filterNumber(totalDurationS)},asetpts=PTS-STARTPTS,aresample=48000,apad=pad_dur=${filterNumber(totalDurationS)},atrim=duration=${filterNumber(totalDurationS)}[aext]`,
    );
    audioLabel = "[aext]";
  }

  return { filter: filters.join(";"), videoLabel, audioLabel };
}

function audioTrackPath(editDecisions: EditDecisions): string | undefined {
  const trackPath = editDecisions.audio?.music?.track_path;
  return typeof trackPath === "string" && trackPath.trim().length > 0 ? trackPath : undefined;
}

function filterNumber(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

function roundSeconds(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function roundFrames(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function resolveAssetPath(path: string, projectRoot: string): string {
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

async function runOutputOperation(
  operation: FfmpegUtilityOutput["operation"],
  args: string[],
  output: string,
): Promise<FfmpegUtilityOutput> {
  const result = await runFfmpeg(["ffmpeg", ...args]);

  return {
    operation,
    stdout: result.stdout,
    stderr: result.stderr,
    exit_code: result.exitCode,
    output_path: output,
  };
}

function runFfmpeg(command: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    execFile(command[0] as string, command.slice(1), { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new FfmpegError("ffmpeg failed", {
            command,
            stderr,
            exitCode: typeof error.code === "number" ? error.code : null,
            cause: error,
          }),
        );
        return;
      }

      resolve({ stdout, stderr, exitCode: 0 });
    });
  });
}

function parseSilenceSegments(stderr: string): SilenceSegment[] {
  const starts: number[] = [];
  const segments: SilenceSegment[] = [];

  for (const line of stderr.split(/\r?\n/)) {
    const start = /silence_start:\s*([0-9.]+)/.exec(line);
    if (start?.[1]) {
      starts.push(Number(start[1]));
      continue;
    }

    const end = /silence_end:\s*([0-9.]+)\s*\|\s*silence_duration:\s*([0-9.]+)/.exec(line);
    if (end?.[1] && end[2]) {
      const end_s = Number(end[1]);
      const duration_s = Number(end[2]);
      const start_s = starts.shift() ?? Math.max(0, end_s - duration_s);
      segments.push({ start_s, end_s, duration_s });
    }
  }

  return segments;
}

function escapeConcatPath(path: string): string {
  return path.replaceAll("'", "'\\''");
}

function excerpt(stderr: string): string {
  const trimmed = stderr.trim();
  if (trimmed.length <= 1_000) {
    return trimmed;
  }

  return trimmed.slice(-1_000);
}
