import { execFile } from "node:child_process";
import { z } from "zod";

const DEFAULT_FFPROBE_TIMEOUT_MS = 10_000;
const DEFAULT_FFPROBE_MAX_BUFFER = 10 * 1024 * 1024;

export const FfprobeStreamSchema = z.object({
  codec_type: z.string(),
  codec_name: z.string().optional(),
  sample_rate: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  frame_rate: z.number().positive().optional(),
});

export const FfprobeResultSchema = z.object({
  format: z.object({
    duration_s: z.number().nonnegative(),
    bit_rate: z.number().int().nonnegative().optional(),
    format_name: z.string().optional(),
  }),
  streams: z.array(FfprobeStreamSchema),
});

export type FfprobeStream = z.infer<typeof FfprobeStreamSchema>;
export type FfprobeResult = z.infer<typeof FfprobeResultSchema>;

export class FfprobeError extends Error {
  readonly path: string;
  readonly command: string[];
  readonly stderr: string;

  constructor(message: string, options: { command: string[]; path?: string; stderr?: string; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "FfprobeError";
    this.path = options.path ?? options.command.at(-1) ?? "";
    this.command = options.command;
    this.stderr = options.stderr ?? "";
  }
}

type RawFfprobeOutput = {
  format?: {
    duration?: string;
    bit_rate?: string;
    format_name?: string;
  };
  streams?: Array<{
    codec_type?: string;
    codec_name?: string;
    sample_rate?: string;
    channels?: number;
    width?: number;
    height?: number;
    avg_frame_rate?: string;
    r_frame_rate?: string;
    duration?: string;
  }>;
};

export async function ffprobe(path: string, options: { timeoutMs?: number } = {}): Promise<FfprobeResult> {
  const command = [
    "ffprobe",
    "-v",
    "error",
    "-print_format",
    "json",
    "-show_format",
    "-show_streams",
    path,
  ];
  const { stdout, stderr } = await runFfprobe(command, options.timeoutMs ?? DEFAULT_FFPROBE_TIMEOUT_MS);
  let raw: RawFfprobeOutput;

  try {
    raw = JSON.parse(stdout) as RawFfprobeOutput;
  } catch (error) {
    throw new FfprobeError(`ffprobe returned invalid JSON for ${path}`, {
      command,
      path,
      stderr: stderr || (error instanceof Error ? error.message : String(error)),
      cause: error,
    });
  }

  return FfprobeResultSchema.parse(normalizeFfprobeOutput(raw));
}

function normalizeFfprobeOutput(raw: RawFfprobeOutput): FfprobeResult {
  const streams = (raw.streams ?? [])
    .filter((stream) => typeof stream.codec_type === "string")
    .map((stream) => ({
      codec_type: stream.codec_type as string,
      codec_name: stream.codec_name,
      sample_rate: numberFromString(stream.sample_rate),
      channels: stream.channels,
      width: stream.width,
      height: stream.height,
      frame_rate: frameRateFromRatio(stream.avg_frame_rate) ?? frameRateFromRatio(stream.r_frame_rate),
    }));

  const duration = numberFromString(raw.format?.duration) ?? maxStreamDuration(raw.streams ?? []) ?? 0;

  return {
    format: {
      duration_s: duration,
      bit_rate: integerFromString(raw.format?.bit_rate),
      format_name: raw.format?.format_name,
    },
    streams,
  };
}

function maxStreamDuration(streams: NonNullable<RawFfprobeOutput["streams"]>): number | undefined {
  const durations = streams
    .map((stream) => numberFromString(stream.duration))
    .filter((duration): duration is number => duration !== undefined);

  if (durations.length === 0) {
    return undefined;
  }

  return Math.max(...durations);
}

function numberFromString(value: string | undefined): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function integerFromString(value: string | undefined): number | undefined {
  const parsed = numberFromString(value);
  return parsed === undefined ? undefined : Math.trunc(parsed);
}

function frameRateFromRatio(value: string | undefined): number | undefined {
  if (value === undefined || value === "0/0") {
    return undefined;
  }

  const [rawNumerator, rawDenominator] = value.split("/");
  const numerator = Number(rawNumerator);
  const denominator = Number(rawDenominator);

  if (!Number.isFinite(numerator) || numerator <= 0) {
    return undefined;
  }

  if (rawDenominator === undefined) {
    return numerator;
  }

  if (!Number.isFinite(denominator) || denominator <= 0) {
    return undefined;
  }

  return numerator / denominator;
}

function runFfprobe(command: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      command[0] as string,
      command.slice(1),
      { encoding: "utf8", maxBuffer: DEFAULT_FFPROBE_MAX_BUFFER, timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new FfprobeError(`ffprobe failed for ${command.at(-1) ?? "input"}: ${error.message}`, {
              command,
              stderr,
              cause: error,
            }),
          );
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
}
