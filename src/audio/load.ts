import { ffprobe } from "./ffprobe.js";
import type { AudioTrack } from "./types.js";

export async function load(path: string): Promise<AudioTrack> {
  const probe = await ffprobe(path);
  const stream = probe.streams?.find((candidate) => candidate.codec_type === "audio");

  if (!stream) {
    throw new Error(`No audio stream found in ${path}`);
  }

  const duration_s = parseRequiredNumber(probe.format?.duration ?? stream.duration, "duration_s", path);
  const sample_rate = parseRequiredInteger(stream.sample_rate, "sample_rate", path);
  const channels = parseRequiredInteger(stream.channels, "channels", path);

  return {
    path,
    duration_s,
    sample_rate,
    channels,
  };
}

function parseRequiredNumber(value: unknown, field: string, path: string): number {
  const parsed = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid ${field} from ffprobe for ${path}`);
  }

  return parsed;
}

function parseRequiredInteger(value: unknown, field: string, path: string): number {
  const parsed = parseRequiredNumber(value, field, path);

  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid ${field} from ffprobe for ${path}`);
  }

  return parsed;
}
