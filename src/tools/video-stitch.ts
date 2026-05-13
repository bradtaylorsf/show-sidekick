import { z } from "zod";
import { ffprobe } from "../audio/ffprobe.js";
import { runFfmpeg } from "../media/ffmpeg-runner.js";
import { defineTool } from "../registry/index.js";

const INSTALL_INSTRUCTIONS = `macOS: brew install ffmpeg
Linux: sudo apt-get update && sudo apt-get install ffmpeg
Windows: winget install Gyan.FFmpeg`;

const TransitionSchema = z
  .object({
    kind: z.enum(["crossfade", "fade", "cut"]).default("crossfade"),
    duration_s: z.number().nonnegative().default(0.5),
  })
  .default({ kind: "crossfade", duration_s: 0.5 });

export const VideoStitchInputSchema = z.object({
  inputs: z.array(z.string()).min(2),
  output: z.string(),
  transition: TransitionSchema,
});

export const VideoStitchOutputSchema = z.object({
  operation: z.literal("video_stitch"),
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number().int(),
  output_path: z.string(),
  clip_count: z.number().int().positive(),
  transitions_applied: z.number().int().nonnegative(),
  transition_kind: z.enum(["crossfade", "fade", "cut"]),
  transition_duration_s: z.number().nonnegative(),
});

export type VideoStitchInput = z.infer<typeof VideoStitchInputSchema>;
export type VideoStitchOutput = z.infer<typeof VideoStitchOutputSchema>;

type ClipInfo = {
  duration_s: number;
  width: number;
  height: number;
  hasAudio: boolean;
};

export default defineTool({
  name: "video_stitch",
  capability: "video_compose",
  provider: "ffmpeg",
  status: "production",
  integration: {
    kind: "binary",
    binary: "ffmpeg",
    install: INSTALL_INSTRUCTIONS,
  },
  best_for: "stitching multiple clips into a single rough cut with cut or crossfade transitions",
  supports: ["concat", "crossfade", "fade"],
  input: VideoStitchInputSchema,
  output: VideoStitchOutputSchema,

  async execute(params) {
    const input = VideoStitchInputSchema.parse(params);
    const clips = await Promise.all(input.inputs.map((clipPath) => inspectClip(clipPath)));
    const transition = input.transition;
    const firstVideo = clips[0];
    if (!firstVideo) {
      throw new Error("video_stitch requires at least two inputs");
    }

    const duration = transition.kind === "cut" ? 0 : transition.duration_s;
    if (duration > 0) {
      const shortest = Math.min(...clips.map((clip) => clip.duration_s));
      if (duration >= shortest) {
        throw new Error(`transition.duration_s must be shorter than the shortest clip (${shortest}s)`);
      }
    }

    const hasAudio = clips.every((clip) => clip.hasAudio);
    const { filter, videoLabel, audioLabel } =
      transition.kind === "cut" || duration === 0
        ? cutFilter(clips, firstVideo, hasAudio)
        : crossfadeFilter(clips, firstVideo, hasAudio, duration);

    const command = [
      "ffmpeg",
      "-y",
      "-hide_banner",
      ...input.inputs.flatMap((clipPath) => ["-i", clipPath]),
      "-filter_complex",
      filter,
      "-map",
      videoLabel,
      ...(audioLabel ? ["-map", audioLabel] : ["-an"]),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      ...(audioLabel ? ["-c:a", "aac"] : []),
      input.output,
    ];
    const result = await runFfmpeg(command);

    return {
      operation: "video_stitch" as const,
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exitCode,
      output_path: input.output,
      clip_count: input.inputs.length,
      transitions_applied: duration > 0 ? input.inputs.length - 1 : 0,
      transition_kind: transition.kind,
      transition_duration_s: duration,
    };
  },
});

async function inspectClip(input: string): Promise<ClipInfo> {
  const probe = await ffprobe(input);
  const video = probe.streams.find((stream) => stream.codec_type === "video" && stream.width && stream.height);

  if (!video?.width || !video.height) {
    throw new Error(`input has no video stream: ${input}`);
  }

  return {
    duration_s: probe.format.duration_s,
    width: video.width,
    height: video.height,
    hasAudio: probe.streams.some((stream) => stream.codec_type === "audio"),
  };
}

function normalizedInputs(clips: ClipInfo[], firstVideo: ClipInfo, hasAudio: boolean): string[] {
  const filters: string[] = [];

  clips.forEach((_clip, index) => {
    filters.push(
      `[${index}:v]setpts=PTS-STARTPTS,scale=${firstVideo.width}:${firstVideo.height},setsar=1,fps=30,format=yuv420p[v${index}]`,
    );

    if (hasAudio) {
      filters.push(`[${index}:a]asetpts=PTS-STARTPTS,aresample=48000[a${index}]`);
    }
  });

  return filters;
}

function cutFilter(
  clips: ClipInfo[],
  firstVideo: ClipInfo,
  hasAudio: boolean,
): { filter: string; videoLabel: string; audioLabel?: string } {
  const filters = normalizedInputs(clips, firstVideo, hasAudio);
  const inputs = clips.map((_clip, index) => (hasAudio ? `[v${index}][a${index}]` : `[v${index}]`)).join("");
  const audio = hasAudio ? 1 : 0;
  filters.push(`${inputs}concat=n=${clips.length}:v=1:a=${audio}[vout]${hasAudio ? "[aout]" : ""}`);

  return { filter: filters.join(";"), videoLabel: "[vout]", audioLabel: hasAudio ? "[aout]" : undefined };
}

function crossfadeFilter(
  clips: ClipInfo[],
  firstVideo: ClipInfo,
  hasAudio: boolean,
  durationS: number,
): { filter: string; videoLabel: string; audioLabel?: string } {
  const filters = normalizedInputs(clips, firstVideo, hasAudio);
  let cumulativeDuration = clips[0]?.duration_s ?? 0;
  let previousVideo = "v0";
  let previousAudio = "a0";

  for (let index = 1; index < clips.length; index += 1) {
    const videoOut = `xv${index}`;
    const audioOut = `xa${index}`;
    const offset = Math.max(0, cumulativeDuration - durationS);
    filters.push(
      `[${previousVideo}][v${index}]xfade=transition=fade:duration=${durationS}:offset=${offset.toFixed(6)}[${videoOut}]`,
    );

    if (hasAudio) {
      filters.push(`[${previousAudio}][a${index}]acrossfade=d=${durationS}:c1=tri:c2=tri[${audioOut}]`);
      previousAudio = audioOut;
    }

    previousVideo = videoOut;
    cumulativeDuration += (clips[index]?.duration_s ?? 0) - durationS;
  }

  return {
    filter: filters.join(";"),
    videoLabel: `[${previousVideo}]`,
    audioLabel: hasAudio ? `[${previousAudio}]` : undefined,
  };
}
