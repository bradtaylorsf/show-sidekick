import { execFile } from "node:child_process";
import { z } from "zod";

export const FfprobeStreamSchema = z.object({
  codec_type: z.string(),
  codec_name: z.string().optional(),
  sample_rate: z.number().int().positive().optional(),
  channels: z.number().int().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
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
  readonly command: string[];
  readonly stderr: string;

  constructor(message: string, options: { command: string[]; stderr: string; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "FfprobeError";
    this.command = options.command;
    this.stderr = options.stderr;
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
    duration?: string;
  }>;
};

export async function ffprobe(path: string): Promise<FfprobeResult> {
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
  const { stdout } = await runFfprobe(command);
  let raw: RawFfprobeOutput;

  try {
    raw = JSON.parse(stdout) as RawFfprobeOutput;
  } catch (error) {
    throw new FfprobeError("ffprobe returned invalid JSON", {
      command,
      stderr: error instanceof Error ? error.message : String(error),
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

function runFfprobe(command: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command[0] as string, command.slice(1), { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new FfprobeError("ffprobe failed", {
            command,
            stderr,
            cause: error,
          }),
        );
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}
