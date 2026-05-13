import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { DuckingSchema } from "../artifacts/edit-decisions.js";
import type { Ducking } from "../artifacts/edit-decisions.js";
import type { ToolCommandRunner } from "../registry/tool.js";

export { DuckingSchema };
export type { Ducking };

export const defaultRunCli: ToolCommandRunner = (command, args, options = {}) => {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${command} failed: ${stderr || error.message}`));
          return;
        }

        resolvePromise({ stdout, stderr });
      },
    );

    if (options.input !== undefined) {
      child.stdin?.end(options.input);
    }
  });
};

export function resolveProjectPath(path: string, projectRoot: string): string {
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

export function resolveOutputPath(
  outputPath: string | undefined,
  inputPath: string,
  projectRoot: string,
  options: { toolDir: string; suffix: string; extension?: string },
): string {
  if (outputPath) {
    return resolveProjectPath(outputPath, projectRoot);
  }

  const inputExtension = extname(inputPath);
  const extension = normalizeExtension(options.extension ?? inputExtension);
  const base = sanitizeFileStem(basename(inputPath, inputExtension));
  return join(projectRoot, "projects", "_tool_runs", options.toolDir, `${base}${options.suffix}${extension}`);
}

export function resolveToolRunPath(projectRoot: string, toolDir: string, fileName: string): string {
  return join(projectRoot, "projects", "_tool_runs", toolDir, fileName);
}

export async function ensureOutputDir(outputPath: string): Promise<void> {
  await mkdir(dirname(outputPath), { recursive: true });
}

export function srtTimestamp(seconds: number): string {
  const parts = timestampParts(seconds);
  return `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)},${padMilliseconds(parts.milliseconds)}`;
}

export function vttTimestamp(seconds: number): string {
  const parts = timestampParts(seconds);
  return `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}.${padMilliseconds(parts.milliseconds)}`;
}

export function formatFilterNumber(value: number): string {
  if (Number.isInteger(value)) {
    return String(value);
  }

  return value.toFixed(6).replace(/0+$/, "").replace(/\.$/, "");
}

function timestampParts(seconds: number): { hours: number; minutes: number; seconds: number; milliseconds: number } {
  const totalMilliseconds = Math.max(0, Math.round(seconds * 1000));
  const milliseconds = totalMilliseconds % 1000;
  const totalSeconds = Math.floor(totalMilliseconds / 1000);
  const wholeSeconds = totalSeconds % 60;
  const totalMinutes = Math.floor(totalSeconds / 60);
  const minutes = totalMinutes % 60;
  const hours = Math.floor(totalMinutes / 60);

  return { hours, minutes, seconds: wholeSeconds, milliseconds };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function padMilliseconds(value: number): string {
  return String(value).padStart(3, "0");
}

function normalizeExtension(extension: string): string {
  if (!extension) {
    return ".wav";
  }

  return extension.startsWith(".") ? extension : `.${extension}`;
}

function sanitizeFileStem(value: string): string {
  const sanitized = value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return sanitized || "audio";
}
