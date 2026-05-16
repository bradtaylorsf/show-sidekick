import { execFile } from "node:child_process";
import { z } from "zod";
import { AudioEnergySchema, type AudioEnergy, type AudioEnergyProfileWindow, type AudioEnergyRawPoint } from "../artifacts/audio-energy.js";
import { defineTool } from "../registry/index.js";
import { errorWithInstallHint } from "../tool-support/errors.js";
import { resolveProjectReadPath } from "../tool-support/paths.js";

const INSTALL = "brew install ffmpeg";
const SILENCE_LUFS = -120;
const DEFAULT_PROFILE_WINDOW_S = 1;
const DEFAULT_ACTIVE_THRESHOLD_LUFS = -45;
const DEFAULT_BEST_WINDOW_S = 4;

const inputSchema = z.object({
  path: z.string().min(1),
  window_s: z.number().positive().default(DEFAULT_PROFILE_WINDOW_S),
  silence_threshold_lufs: z.number().default(DEFAULT_ACTIVE_THRESHOLD_LUFS),
  best_window_s: z.number().positive().default(DEFAULT_BEST_WINDOW_S),
});

type AudioEnergyInput = z.infer<typeof inputSchema>;

export function parseAudioEnergyLog(
  log: string,
  options: number | { window_s?: number; silence_threshold_lufs?: number; best_window_s?: number } = {},
): AudioEnergy {
  const normalized =
    typeof options === "number"
      ? { window_s: options, silence_threshold_lufs: DEFAULT_ACTIVE_THRESHOLD_LUFS, best_window_s: DEFAULT_BEST_WINDOW_S }
      : {
          window_s: options.window_s ?? DEFAULT_PROFILE_WINDOW_S,
          silence_threshold_lufs: options.silence_threshold_lufs ?? DEFAULT_ACTIVE_THRESHOLD_LUFS,
          best_window_s: options.best_window_s ?? DEFAULT_BEST_WINDOW_S,
        };
  const raw_points = parseEbuR128Points(log);
  const energy_profile = buildEnergyProfile(raw_points, normalized.window_s);
  const activePoints = raw_points.filter(
    (point) => point.is_silence !== true && point.momentary_lufs > normalized.silence_threshold_lufs,
  );
  const firstActive = activePoints[0];
  const peak = activePoints.reduce<AudioEnergyRawPoint | undefined>((best, point) => {
    if (best === undefined || point.momentary_lufs > best.momentary_lufs) {
      return point;
    }

    return best;
  }, undefined);

  return AudioEnergySchema.parse({
    source: "ffmpeg-ebur128",
    raw_points,
    energy_profile,
    first_active_s: firstActive ? roundSeconds(firstActive.time_s) : null,
    peak_s: peak ? roundSeconds(peak.time_s) : null,
    recommended_offset_s: firstActive ? roundSeconds(firstActive.time_s) : 0,
    best_window: selectBestWindow(energy_profile, normalized.best_window_s),
    silence_threshold_lufs: normalized.silence_threshold_lufs,
    analysis_window_s: normalized.window_s,
  });
}

async function runFile(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(errorWithInstallHint(error, INSTALL));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

const audioEnergy = defineTool({
  name: "audio_energy",
  capability: "audio_energy",
  provider: "ffmpeg",
  status: "beta",
  integration: {
    kind: "binary",
    binary: "ffmpeg",
    install: INSTALL,
  },
  best_for: "EBU R128 momentary loudness analysis for music-led timing",
  supports: ["ebu-r128", "momentary-loudness", "audio-energy-profile"],
  input: inputSchema,
  output: AudioEnergySchema,
  async execute(params: AudioEnergyInput, ctx) {
    const input = inputSchema.parse(params);
    const inputPath = resolveProjectReadPath(input.path, ctx.projectRoot);
    const result = await runFile("ffmpeg", [
      "-hide_banner",
      "-i",
      inputPath,
      "-af",
      "ebur128=metadata=1",
      "-f",
      "null",
      "-",
    ]);

    return AudioEnergySchema.parse(
      parseAudioEnergyLog(`${result.stdout}\n${result.stderr}`, {
        window_s: input.window_s,
        silence_threshold_lufs: input.silence_threshold_lufs,
        best_window_s: input.best_window_s,
      }),
    );
  },
});

export default audioEnergy;

function parseEbuR128Points(log: string): AudioEnergyRawPoint[] {
  const points: AudioEnergyRawPoint[] = [];

  for (const line of log.split(/\r?\n/u)) {
    const timeMatch = /\bt:\s*(-?\d+(?:\.\d+)?)/u.exec(line);
    const momentaryMatch = /\bM:\s*(-?(?:inf|\d+(?:\.\d+)?))/iu.exec(line);

    if (!timeMatch || !momentaryMatch) {
      continue;
    }

    const time_s = Number(timeMatch[1]);
    if (!Number.isFinite(time_s) || time_s < 0) {
      continue;
    }

    const parsed = parseMomentaryLufs(momentaryMatch[1] as string);
    points.push({
      time_s: roundSeconds(time_s),
      momentary_lufs: parsed.lufs,
      ...(parsed.isSilence ? { is_silence: true } : {}),
    });
  }

  return points.sort((left, right) => left.time_s - right.time_s);
}

function parseMomentaryLufs(value: string): { lufs: number; isSilence: boolean } {
  if (/^-?inf$/iu.test(value)) {
    return { lufs: SILENCE_LUFS, isSilence: true };
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= SILENCE_LUFS) {
    return { lufs: SILENCE_LUFS, isSilence: true };
  }

  return { lufs: roundLufs(parsed), isSilence: false };
}

function buildEnergyProfile(rawPoints: AudioEnergyRawPoint[], windowS: number): AudioEnergyProfileWindow[] {
  if (rawPoints.length === 0) {
    return [];
  }

  const buckets = new Map<number, AudioEnergyRawPoint[]>();
  for (const point of rawPoints) {
    const bucketIndex = Math.floor(point.time_s / windowS);
    const bucket = buckets.get(bucketIndex) ?? [];
    bucket.push(point);
    buckets.set(bucketIndex, bucket);
  }

  return [...buckets.entries()]
    .sort(([left], [right]) => left - right)
    .map(([bucketIndex, points]) => {
      const lufs = aggregateLufs(points.map((point) => point.momentary_lufs));

      return {
        start_s: roundSeconds(bucketIndex * windowS),
        end_s: roundSeconds((bucketIndex + 1) * windowS),
        rms: roundRms(lufsToRms(lufs)),
        lufs,
      };
    });
}

function selectBestWindow(energyProfile: AudioEnergyProfileWindow[], windowS: number): AudioEnergy["best_window"] {
  if (energyProfile.length === 0) {
    return null;
  }

  const profileWindowS = Math.max(...energyProfile.map((window) => window.end_s - window.start_s), 0);
  const targetCount = Math.max(1, Math.round(windowS / (profileWindowS || DEFAULT_PROFILE_WINDOW_S)));
  const sliceCount = Math.min(targetCount, energyProfile.length);
  let best:
    | {
        windows: AudioEnergyProfileWindow[];
        score: number;
      }
    | undefined;

  for (let index = 0; index <= energyProfile.length - sliceCount; index += 1) {
    const windows = energyProfile.slice(index, index + sliceCount);
    const score = windows.reduce((sum, window) => sum + lufsToPower(window.lufs), 0) / windows.length;

    if (best === undefined || score > best.score) {
      best = { windows, score };
    }
  }

  const windows = best?.windows ?? energyProfile;
  const first = windows[0] as AudioEnergyProfileWindow;
  const last = windows.at(-1) as AudioEnergyProfileWindow;

  return {
    start_s: first.start_s,
    end_s: last.end_s,
    average_lufs: aggregateLufs(windows.map((window) => window.lufs)),
    peak_lufs: Math.max(...windows.map((window) => window.lufs)),
  };
}

function aggregateLufs(values: number[]): number {
  const powers = values.map(lufsToPower);
  if (powers.length === 0) {
    return SILENCE_LUFS;
  }

  const averagePower = powers.reduce((sum, value) => sum + value, 0) / powers.length;
  if (averagePower <= 0) {
    return SILENCE_LUFS;
  }

  return roundLufs(10 * Math.log10(averagePower));
}

function lufsToPower(lufs: number): number {
  return 10 ** (Math.max(SILENCE_LUFS, lufs) / 10);
}

function lufsToRms(lufs: number): number {
  return 10 ** (Math.max(SILENCE_LUFS, lufs) / 20);
}

function roundSeconds(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function roundLufs(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundRms(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}
