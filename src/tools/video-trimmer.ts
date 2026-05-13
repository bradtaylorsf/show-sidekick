import { z } from "zod";
import { ffprobe } from "../audio/ffprobe.js";
import { runFfmpeg } from "../media/ffmpeg-runner.js";
import { defineTool } from "../registry/index.js";

const INSTALL_INSTRUCTIONS = `macOS: brew install ffmpeg
Linux: sudo apt-get update && sudo apt-get install ffmpeg
Windows: winget install Gyan.FFmpeg`;

export const VideoTrimmerInputSchema = z
  .object({
    input: z.string(),
    output: z.string(),
    start_s: z.number().nonnegative(),
    end_s: z.number().positive(),
    fps: z.number().positive().optional(),
  })
  .refine((value) => value.end_s > value.start_s, {
    message: "end_s must be greater than start_s",
    path: ["end_s"],
  });

export const VideoTrimmerOutputSchema = z.object({
  operation: z.literal("video_trimmer"),
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number().int(),
  output_path: z.string(),
  requested_duration_s: z.number().positive(),
  actual_duration_s: z.number().nonnegative(),
  drift_s: z.number().nonnegative(),
  drift_frames: z.number().nonnegative().optional(),
  tolerance_s: z.number().positive().optional(),
  within_tolerance: z.boolean().optional(),
});

export type VideoTrimmerInput = z.infer<typeof VideoTrimmerInputSchema>;
export type VideoTrimmerOutput = z.infer<typeof VideoTrimmerOutputSchema>;

export default defineTool({
  name: "video_trimmer",
  capability: "video_compose",
  provider: "ffmpeg",
  status: "production",
  integration: {
    kind: "binary",
    binary: "ffmpeg",
    install: INSTALL_INSTRUCTIONS,
  },
  best_for: "frame-checked video trims for rough-cut segments",
  supports: ["trim", "frame-accurate"],
  input: VideoTrimmerInputSchema,
  output: VideoTrimmerOutputSchema,

  async execute(params) {
    const input = VideoTrimmerInputSchema.parse(params);
    const probe = await ffprobe(input.input);
    const hasAudio = probe.streams.some((stream) => stream.codec_type === "audio");
    const filter = trimFilter(input, hasAudio);
    const command = [
      "ffmpeg",
      "-y",
      "-hide_banner",
      "-i",
      input.input,
      "-filter_complex",
      filter,
      "-map",
      "[vout]",
      ...(hasAudio ? ["-map", "[aout]"] : ["-an"]),
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      ...(hasAudio ? ["-c:a", "aac"] : []),
      "-avoid_negative_ts",
      "make_zero",
      input.output,
    ];
    const result = await runFfmpeg(command);
    const outputProbe = await ffprobe(input.output);
    const requestedDuration = input.end_s - input.start_s;
    const actualDuration = outputProbe.format.duration_s;
    const driftS = Math.abs(actualDuration - requestedDuration);
    const toleranceS = input.fps ? 1 / input.fps : undefined;
    const driftFrames = input.fps ? driftS * input.fps : undefined;

    return {
      operation: "video_trimmer" as const,
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exitCode,
      output_path: input.output,
      requested_duration_s: requestedDuration,
      actual_duration_s: actualDuration,
      drift_s: driftS,
      drift_frames: driftFrames,
      tolerance_s: toleranceS,
      within_tolerance: toleranceS === undefined ? undefined : driftS <= toleranceS,
    };
  },
});

function trimFilter(params: VideoTrimmerInput, hasAudio: boolean): string {
  const videoFilters = [`trim=start=${params.start_s}:end=${params.end_s}`, "setpts=PTS-STARTPTS"];
  if (params.fps) {
    videoFilters.push(`fps=${params.fps}`);
  }

  const filters = [`[0:v]${videoFilters.join(",")}[vout]`];
  if (hasAudio) {
    filters.push(`[0:a]atrim=start=${params.start_s}:end=${params.end_s},asetpts=PTS-STARTPTS[aout]`);
  }

  return filters.join(";");
}
