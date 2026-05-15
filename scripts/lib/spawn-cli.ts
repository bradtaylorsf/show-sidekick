import { spawn } from "node:child_process";

export type SpawnCommandOptions = {
  readonly cwd: string;
  readonly env?: NodeJS.ProcessEnv;
  readonly timeoutMs?: number;
};

export type SpawnResult = {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly exitCode: number;
  readonly signal: NodeJS.Signals | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly timedOut: boolean;
  readonly lastEvent?: Record<string, unknown>;
};

export type SpawnCommand = (
  command: string,
  args: readonly string[],
  options: SpawnCommandOptions,
) => Promise<SpawnResult>;

const defaultTimeoutMs = 15 * 60 * 1000;

export const defaultSpawnCommand: SpawnCommand = async (command, args, options) => {
  return new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(command, [...args], {
      cwd: options.cwd,
      env: options.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, options.timeoutMs ?? defaultTimeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      stdout += chunk;
    });

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => {
      stderr += chunk;
    });

    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });

    child.on("close", (code, signal) => {
      clearTimeout(timeout);
      resolve({
        command,
        args: [...args],
        cwd: options.cwd,
        exitCode: code ?? 1,
        signal,
        stdout,
        stderr,
        timedOut,
        lastEvent: parseLastEvent(stdout),
      });
    });
  });
};

export function parseLastEvent(stdout: string): Record<string, unknown> | undefined {
  const lines = stdout
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean);

  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const line = lines[index];
    if (line === undefined) {
      continue;
    }

    try {
      const parsed = JSON.parse(line) as unknown;
      if (isRecord(parsed) && typeof parsed.event === "string") {
        return parsed;
      }
    } catch {
      // Non-JSON output is allowed in human CLI paths; keep scanning.
    }
  }

  return undefined;
}

export function commandLine(command: string, args: readonly string[]): string {
  return [command, ...args].map(shellToken).join(" ");
}

function shellToken(value: string): string {
  if (/^[A-Za-z0-9_./:=@+-]+$/u.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
