import { execFile } from "node:child_process";
import { z } from "zod";
import type { Beat } from "../audio/types.js";
import { defineTool } from "../registry/index.js";

const DEFAULT_AUBIO_TIMEOUT_MS = 30_000;
const DEFAULT_AUBIO_MAX_BUFFER = 4 * 1024 * 1024;
const AUBIO_INSTALL = "brew install aubio (macOS) or apt install aubio-tools (Linux)";

const inputSchema = z.object({
  audio_path: z.string(),
  expect_bpm: z.tuple([z.number(), z.number()]).optional(),
  time_signature: z.tuple([z.number().int().positive(), z.number().int().positive()]).optional(),
});

const beatSchema = z.object({
  time_s: z.number(),
  strength: z.number(),
  is_downbeat: z.boolean(),
});

const outputSchema = z.object({
  bpm: z.number(),
  beats: z.array(beatSchema),
});

export default defineTool({
  name: "aubio",
  capability: "beats",
  provider: "aubio",
  status: "production",
  integration: {
    kind: "binary",
    binary: "aubio",
    install: AUBIO_INSTALL,
  },
  best_for: "beat and tempo detection through aubio beat / aubio tempo",
  input: inputSchema,
  output: outputSchema,
  async execute(params) {
    const [tempoOutput, beatOutput] = await Promise.all([
      runAubio(["tempo", params.audio_path], params.audio_path),
      runAubio(["beat", params.audio_path], params.audio_path),
    ]);
    const beatTimes = parseAubioBeatOutput(beatOutput.stdout);
    const beats = buildAubioBeatGrid(beatTimes, params.time_signature?.[0]);
    const bpm = selectAubioBpm(parseAubioTempoOutput(tempoOutput.stdout), params.expect_bpm) ?? inferBpm(beats);

    if (bpm === undefined) {
      throw new Error(`aubio did not return tempo or enough beats for ${params.audio_path}`);
    }

    return outputSchema.parse({ bpm, beats });
  },
});

export type AubioInput = z.infer<typeof inputSchema>;
export type AubioOutput = z.infer<typeof outputSchema>;

export function parseAubioTempoOutput(stdout: string): number[] {
  return stdout
    .split(/\r?\n/u)
    .flatMap((line) => numbersFromLine(line))
    .filter((value) => value >= 30 && value <= 300);
}

export function parseAubioBeatOutput(stdout: string): number[] {
  const times = stdout
    .split(/\r?\n/u)
    .flatMap((line) => numbersFromLine(line))
    .filter((value) => value >= 0)
    .sort((left, right) => left - right);

  return dedupeTimes(times);
}

function runAubio(args: string[], audioPath: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(
      "aubio",
      args,
      { encoding: "utf8", maxBuffer: DEFAULT_AUBIO_MAX_BUFFER, timeout: DEFAULT_AUBIO_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          if (isMissingBinary(error)) {
            reject(new Error(`aubio binary not on PATH. Install: ${AUBIO_INSTALL}`));
            return;
          }

          reject(new Error(`aubio ${args[0]} failed for ${audioPath}: ${error.message}${stderr ? `\n${stderr}` : ""}`));
          return;
        }

        resolve({ stdout, stderr });
      },
    );
  });
}

export function selectAubioBpm(candidates: number[], expectBpm: [number, number] | undefined): number | undefined {
  if (candidates.length === 0) {
    return undefined;
  }

  if (!expectBpm) {
    return candidates[0];
  }

  const [min, max] = expectBpm[0] <= expectBpm[1] ? expectBpm : [expectBpm[1], expectBpm[0]];
  const midpoint = (min + max) / 2;
  const inRange = candidates.filter((candidate) => candidate >= min && candidate <= max);

  if (inRange.length === 0) {
    return candidates[0];
  }

  return inRange.sort((left, right) => Math.abs(left - midpoint) - Math.abs(right - midpoint))[0];
}

export function buildAubioBeatGrid(times: number[], downbeatEvery = 4): Beat[] {
  const medianInterval = median(intervals(times));
  const modulo = requirePositiveInteger(downbeatEvery, "downbeatEvery");

  return times.map((time_s, index) => ({
    time_s: roundSeconds(time_s),
    strength: beatStrength(times, index, medianInterval),
    is_downbeat: index % modulo === 0,
  }));
}

function inferBpm(beats: Beat[]): number | undefined {
  const interval = median(intervals(beats.map((beat) => beat.time_s)));
  return interval === undefined || interval <= 0 ? undefined : roundSeconds(60 / interval);
}

function beatStrength(times: number[], index: number, medianInterval: number | undefined): number {
  if (medianInterval === undefined || medianInterval <= 0 || times.length < 3) {
    return 1;
  }

  const previous = index > 0 ? (times[index] as number) - (times[index - 1] as number) : medianInterval;
  const next = index < times.length - 1 ? (times[index + 1] as number) - (times[index] as number) : medianInterval;
  const irregularity = (Math.abs(previous - medianInterval) + Math.abs(next - medianInterval)) / (2 * medianInterval);

  return roundStrength(1 - irregularity);
}

function intervals(times: number[]): number[] {
  const result: number[] = [];

  for (let index = 1; index < times.length; index += 1) {
    const previous = times[index - 1] as number;
    const current = times[index] as number;
    const interval = current - previous;

    if (Number.isFinite(interval) && interval > 0) {
      result.push(interval);
    }
  }

  return result;
}

function median(values: number[]): number | undefined {
  if (values.length === 0) {
    return undefined;
  }

  const sorted = [...values].sort((left, right) => left - right);
  const midpoint = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[midpoint];
  }

  return ((sorted[midpoint - 1] as number) + (sorted[midpoint] as number)) / 2;
}

function dedupeTimes(times: number[]): number[] {
  const result: number[] = [];

  for (const time of times) {
    const previous = result.at(-1);
    if (previous === undefined || Math.abs(time - previous) > 0.001) {
      result.push(time);
    }
  }

  return result;
}

function numbersFromLine(line: string): number[] {
  return Array.from(line.matchAll(/[-+]?(?:\d+\.?\d*|\.\d+)/gu), (match) => Number(match[0])).filter(Number.isFinite);
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundStrength(value: number): number {
  return Math.round(Math.max(0, Math.min(1, value)) * 1000) / 1000;
}

function isMissingBinary(error: Error): error is NodeJS.ErrnoException {
  return "code" in error && (error as NodeJS.ErrnoException).code === "ENOENT";
}

function requirePositiveInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }

  return value;
}
