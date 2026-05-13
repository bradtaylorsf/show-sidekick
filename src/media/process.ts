import { execFile } from "node:child_process";

export class CommandError extends Error {
  readonly command: string[];
  readonly stdout: string;
  readonly stderr: string;
  readonly exit_code: number | null;

  constructor(message: string, options: { command: string[]; stdout: string; stderr: string; exitCode: number | null; cause?: unknown }) {
    super(message, { cause: options.cause });
    this.name = "CommandError";
    this.command = options.command;
    this.stdout = options.stdout;
    this.stderr = options.stderr;
    this.exit_code = options.exitCode;
  }
}

export type RunCommandOptions = {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  maxBuffer?: number;
};

export function runCommand(binary: string, args: string[], options: RunCommandOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      binary,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        maxBuffer: options.maxBuffer ?? 20 * 1024 * 1024,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(
            new CommandError(`${binary} failed`, {
              command: [binary, ...args],
              stdout,
              stderr,
              exitCode: typeof error.code === "number" ? error.code : null,
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

export async function binaryOnPath(binary: string): Promise<boolean> {
  try {
    await runCommand("which", [binary], { maxBuffer: 1024 * 1024 });
    return true;
  } catch {
    return false;
  }
}
