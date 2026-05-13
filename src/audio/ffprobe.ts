import { execFile } from "node:child_process";

const DEFAULT_FFPROBE_TIMEOUT_MS = 10_000;
const DEFAULT_FFPROBE_MAX_BUFFER = 10 * 1024 * 1024;

export type FfprobeStream = {
  codec_type?: string;
  duration?: string;
  sample_rate?: string;
  channels?: number;
  [key: string]: unknown;
};

export type FfprobeFormat = {
  duration?: string;
  [key: string]: unknown;
};

export interface FfprobeJson {
  streams?: FfprobeStream[];
  format?: FfprobeFormat;
  [key: string]: unknown;
}

export class FfprobeError extends Error {
  readonly path: string;
  readonly stderr: string;

  constructor(message: string, options: { path: string; stderr?: string; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "FfprobeError";
    this.path = options.path;
    this.stderr = options.stderr ?? "";
  }
}

export async function ffprobe(path: string, options: { timeoutMs?: number } = {}): Promise<FfprobeJson> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_FFPROBE_TIMEOUT_MS;
  const args = ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", path];
  const { stdout, stderr } = await runFfprobe(path, args, timeoutMs);

  try {
    return JSON.parse(stdout) as FfprobeJson;
  } catch (error) {
    throw new FfprobeError(`ffprobe returned invalid JSON for ${path}`, {
      path,
      stderr,
      cause: error,
    });
  }
}

function runFfprobe(path: string, args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "ffprobe",
      args,
      { encoding: "utf8", maxBuffer: DEFAULT_FFPROBE_MAX_BUFFER, timeout: timeoutMs },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new FfprobeError(`ffprobe failed for ${path}: ${error.message}`, {
              path,
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
