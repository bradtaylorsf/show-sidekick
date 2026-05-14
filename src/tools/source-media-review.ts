import { execFile } from "node:child_process";
import { extname } from "node:path";
import { z } from "zod";
import { SourceMediaReviewSchema, type SourceMediaReview } from "../artifacts/index.js";
import { defineTool } from "../registry/index.js";
import { errorWithInstallHint } from "../tool-support/errors.js";
import { resolveProjectReadPath } from "../tool-support/paths.js";

const INSTALL = "brew install ffmpeg";

const inputSchema = z.object({
  files: z.array(z.string().min(1)).min(1),
});

type FfprobeRecord = Record<string, unknown>;

export type FfprobeOutput = {
  streams: FfprobeRecord[];
  format?: FfprobeRecord;
};

type SourceMediaReviewInput = z.infer<typeof inputSchema>;
type SourceMediaReviewFile = SourceMediaReview["files"][number];

export function parseFfprobeJson(stdout: string): FfprobeOutput {
  const parsed: unknown = JSON.parse(stdout);
  const root = isRecord(parsed) ? parsed : {};
  const streams = Array.isArray(root.streams) ? root.streams.filter(isRecord) : [];
  const format = isRecord(root.format) ? root.format : undefined;

  return { streams, format };
}

export function buildTechnicalProbe(ffprobe: FfprobeOutput, path = ""): Record<string, unknown> {
  const videoStream = ffprobe.streams.find((stream) => stream.codec_type === "video");
  const audioStream = ffprobe.streams.find((stream) => stream.codec_type === "audio");
  const durationS = firstNumber(ffprobe.format?.duration, videoStream?.duration, audioStream?.duration);
  const width = numberField(videoStream, "width");
  const height = numberField(videoStream, "height");
  const nbFrames = numberField(videoStream, "nb_frames");
  const formatName = stringField(ffprobe.format, "format_name");
  const mediaKind = classifyMediaKind({
    path,
    formatName,
    hasVideo: videoStream !== undefined,
    hasAudio: audioStream !== undefined,
    nbFrames,
  });
  const probe: Record<string, unknown> = {
    stream_count: ffprobe.streams.length,
    media_kind: mediaKind,
  };

  if (formatName !== undefined) {
    probe.format_name = formatName;
  }
  if (durationS !== undefined) {
    probe.duration_s = durationS;
  }
  if (videoStream !== undefined) {
    const codec = stringField(videoStream, "codec_name");
    const frameRate = stringField(videoStream, "r_frame_rate");

    if (codec !== undefined) {
      probe.video_codec = codec;
    }
    if (width !== undefined) {
      probe.width = width;
    }
    if (height !== undefined) {
      probe.height = height;
    }
    if (frameRate !== undefined) {
      probe.r_frame_rate = frameRate;
    }
    if (nbFrames !== undefined) {
      probe.nb_frames = nbFrames;
    }
  }
  if (audioStream !== undefined) {
    const codec = stringField(audioStream, "codec_name");
    const channels = numberField(audioStream, "channels");
    const channelLayout = stringField(audioStream, "channel_layout");
    const sampleRate = numberField(audioStream, "sample_rate");

    if (codec !== undefined) {
      probe.audio_codec = codec;
    }
    if (channels !== undefined) {
      probe.channels = channels;
    }
    if (channelLayout !== undefined) {
      probe.channel_layout = channelLayout;
    }
    if (sampleRate !== undefined) {
      probe.sample_rate = sampleRate;
    }
  }

  return probe;
}

export function planningImplicationsForProbe(probe: Record<string, unknown>): string[] {
  const implications: string[] = [];
  const width = numberValue(probe.width);
  const height = numberValue(probe.height);
  const channels = numberValue(probe.channels);
  const durationS = numberValue(probe.duration_s);
  const mediaKind = stringValue(probe.media_kind);

  if (mediaKind === "video" && width !== undefined && height !== undefined && (width < 720 || height < 480)) {
    implications.push("Low resolution");
  }
  if (channels === 1) {
    implications.push("Mono audio");
  }
  if (durationS !== undefined && durationS < 3) {
    implications.push("Very short clip");
  }
  if (mediaKind === "image" && width !== undefined && height !== undefined && (width < 640 || height < 480)) {
    implications.push("Low resolution (image)");
  }

  return implications;
}

export function summarizeProbe(probe: Record<string, unknown>): string {
  const preferredFields = [
    "duration_s",
    "width",
    "height",
    "channels",
    "media_kind",
    "format_name",
    "video_codec",
    "audio_codec",
    "stream_count",
  ].filter((field) => probe[field] !== undefined);
  const fields = preferredFields.length >= 2 ? preferredFields : Object.keys(probe);
  const first = fields[0] ?? "stream_count";
  const second = fields[1] ?? "media_kind";

  return `Probe cites ${first}=${formatProbeValue(probe[first])} and ${second}=${formatProbeValue(
    probe[second],
  )}; use planning_implications for quality risks.`;
}

export function buildSourceMediaReviewFile(path: string, ffprobe: FfprobeOutput): SourceMediaReviewFile {
  const technicalProbe = buildTechnicalProbe(ffprobe, path);

  return {
    path,
    reviewed: true,
    technical_probe: technicalProbe,
    content_summary: summarizeProbe(technicalProbe),
    planning_implications: planningImplicationsForProbe(technicalProbe),
  };
}

export async function probeMediaFile(path: string): Promise<Record<string, unknown>> {
  const result = await runFfprobe(path);
  return buildTechnicalProbe(parseFfprobeJson(result.stdout), path);
}

async function runFfprobe(path: string): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile("ffprobe", ["-v", "error", "-show_streams", "-show_format", "-of", "json", path], (error, stdout, stderr) => {
      if (error) {
        reject(errorWithInstallHint(new Error(stderr.trim() || error.message), INSTALL));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

function classifyMediaKind(input: {
  path: string;
  formatName?: string;
  hasVideo: boolean;
  hasAudio: boolean;
  nbFrames?: number;
}): string {
  if (!input.hasVideo && input.hasAudio) {
    return "audio";
  }

  if (input.hasVideo && !input.hasAudio && isImageLike(input)) {
    return "image";
  }

  if (input.hasVideo) {
    return "video";
  }

  return "unknown";
}

function isImageLike(input: { path: string; formatName?: string; nbFrames?: number }): boolean {
  const extension = extname(input.path).toLowerCase();
  const imageByExtension = [".bmp", ".gif", ".jpg", ".jpeg", ".png", ".tif", ".tiff", ".webp"].includes(extension);
  const imageByFormat = input.formatName !== undefined && /(image|jpeg|mjpeg|png|webp|gif|bmp)/i.test(input.formatName);
  const singleFrame = input.nbFrames !== undefined && input.nbFrames <= 1;

  return imageByExtension || imageByFormat || singleFrame;
}

function stringField(record: FfprobeRecord | undefined, field: string): string | undefined {
  const value = record?.[field];
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberField(record: FfprobeRecord | undefined, field: string): number | undefined {
  return numberValue(record?.[field]);
}

function firstNumber(...values: unknown[]): number | undefined {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed !== undefined) {
      return parsed;
    }
  }

  return undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function formatProbeValue(value: unknown): string {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return "unknown";
}

function isRecord(value: unknown): value is FfprobeRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const sourceMediaReview = defineTool({
  name: "source_media_review",
  capability: "source_media_review",
  provider: "predit",
  status: "beta",
  integration: {
    kind: "binary",
    binary: "ffprobe",
    install: INSTALL,
  },
  best_for: "grounding source media planning in actual ffprobe technical facts",
  supports: ["ffprobe-json", "quality-risk-rules", "source-review-artifact"],
  input: inputSchema,
  output: SourceMediaReviewSchema,
  async execute(params: SourceMediaReviewInput, ctx): Promise<SourceMediaReview> {
    const input = inputSchema.parse(params);
    const files = [];

    for (const path of input.files) {
      const resolvedPath = resolveProjectReadPath(path, ctx.projectRoot);
      const result = await runFfprobe(resolvedPath);
      files.push(buildSourceMediaReviewFile(path, parseFfprobeJson(result.stdout)));
    }

    return SourceMediaReviewSchema.parse({ files });
  },
});

export default sourceMediaReview;
