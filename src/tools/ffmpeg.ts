import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { ffprobe, FfprobeResultSchema } from "../audio/ffprobe.js";
import { defineTool } from "../registry/index.js";

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
]);

export const FfmpegOutputSchema = BaseOutputSchema.extend({
  operation: z.enum(["trim", "concat", "silence_detect", "probe", "audio_extract", "normalize"]),
  silence_segments: z.array(SilenceSegmentSchema).optional(),
  probe: FfprobeResultSchema.optional(),
});

export type FfmpegInput = z.infer<typeof FfmpegInputSchema>;
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

  async execute(params) {
    if (params.operation === "trim" && params.end_s <= params.start_s) {
      throw new FfmpegError("trim end_s must be greater than start_s", {
        command: ["ffmpeg"],
        stderr: `invalid trim range: start_s=${params.start_s}, end_s=${params.end_s}`,
        exitCode: null,
      });
    }

    switch (params.operation) {
      case "trim":
        return runOutputOperation(params.operation, trimArgs(params), params.output);
      case "concat":
        return concat(params);
      case "silence_detect":
        return silenceDetect(params);
      case "probe":
        return probe(params.input);
      case "audio_extract":
        return runOutputOperation(params.operation, audioExtractArgs(params), params.output);
      case "normalize":
        return runOutputOperation(params.operation, normalizeArgs(params), params.output);
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
  const dir = await mkdtemp(join(tmpdir(), "predit-ffmpeg-concat-"));
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

async function runOutputOperation(operation: FfmpegOutput["operation"], args: string[], output: string): Promise<FfmpegOutput> {
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
