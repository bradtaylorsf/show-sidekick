import { execFile } from "node:child_process";
import { access } from "node:fs/promises";

export class FfmpegCommandError extends Error {
  readonly command: string[];
  readonly stderr: string;
  readonly stderr_excerpt: string;
  readonly exit_code: number | null;

  constructor(message: string, options: { command: string[]; stderr: string; exitCode: number | null; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "FfmpegCommandError";
    this.command = options.command;
    this.stderr = options.stderr;
    this.stderr_excerpt = excerpt(options.stderr);
    this.exit_code = options.exitCode;
  }
}

export async function runFfmpeg(command: string[]): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    execFile(command[0] as string, command.slice(1), { maxBuffer: 40 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(
          new FfmpegCommandError("ffmpeg failed", {
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

export async function assertOutputExists(path: string): Promise<void> {
  await access(path);
}

function excerpt(stderr: string): string {
  const trimmed = stderr.trim();
  if (trimmed.length <= 1_000) {
    return trimmed;
  }

  return trimmed.slice(-1_000);
}
