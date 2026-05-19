import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { transcribe } from "../audio/transcribe.js";
import { NoToolAvailable, defineTool, type ToolContext } from "../registry/index.js";
import { resolveProjectReadPath } from "../tool-support/paths.js";
import frameSampler from "./frame-sampler.js";

const inputSchema = z.object({
  path: z.string().min(1),
  frame_count: z.number().int().positive().default(6),
  output_dir: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
});

const sampledFrameSchema = z.object({
  index: z.number().int().min(0),
  time_s: z.number(),
  path: z.string().min(1),
});

const transcriptSegmentSchema = z.object({
  text: z.string(),
  start_s: z.number(),
  end_s: z.number(),
});

const outputSchema = z.object({
  summary: z.string().min(1),
  frames: z.array(sampledFrameSchema),
  transcript_segments: z.array(transcriptSegmentSchema),
  duration_s: z.number().nonnegative(),
});

type VideoUnderstandInput = z.infer<typeof inputSchema>;
type VideoUnderstandOutput = z.infer<typeof outputSchema>;
type SampledFrame = z.infer<typeof sampledFrameSchema>;
type TranscriptSegment = z.infer<typeof transcriptSegmentSchema>;

export function summarizeUnderstanding(frames: SampledFrame[], transcriptSegments: TranscriptSegment[]): string {
  const framePart =
    frames.length === 1
      ? "Sampled 1 frame"
      : `Sampled ${frames.length} frames from ${frames[0]?.time_s ?? 0}s to ${frames.at(-1)?.time_s ?? 0}s`;
  const spokenText = transcriptSegments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
  const transcriptPart = spokenText.length > 0 ? `Transcript: ${spokenText}` : "No transcript segments were available.";

  return `${framePart}. ${transcriptPart}`;
}

export function inferUnderstandingDuration(frames: SampledFrame[], transcriptSegments: TranscriptSegment[]): number {
  const frameEnd = Math.max(0, ...frames.map((frame) => frame.time_s));
  const transcriptEnd = Math.max(0, ...transcriptSegments.map((segment) => segment.end_s));

  return Math.max(frameEnd, transcriptEnd);
}

const videoUnderstand = defineTool({
  name: "video_understand",
  capability: "video_understanding",
  provider: "show-sidekick",
  status: "beta",
  integration: {
    kind: "library",
    package: "show-sidekick",
    install: "npm install show-sidekick",
  },
  best_for: "combining sampled frames and transcription into a quick content summary",
  supports: ["frame-sampling", "audio-transcription", "content-summary"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => {
    const frameSamplerAvailability = await frameSampler.isAvailable();
    return frameSamplerAvailability;
  },
  async execute(params: VideoUnderstandInput, ctx: ToolContext): Promise<VideoUnderstandOutput> {
    const input = inputSchema.parse(params);
    const inputPath = resolveProjectReadPath(input.path, ctx.projectRoot);
    const toolRunDir = join(ctx.projectRoot, "projects", "_tool_runs");
    await mkdir(toolRunDir, { recursive: true });
    const outputDir = input.output_dir ?? (await mkdtemp(join(toolRunDir, "video-understand-")));
    const frameResult = await frameSampler.execute(
      {
        path: inputPath,
        count: input.frame_count,
        mode: "uniform",
        output_dir: outputDir,
      },
      ctx,
    );
    let transcriptSegments: TranscriptSegment[] = [];

    try {
      const transcript = await transcribe(
        { path: inputPath, duration_s: 0, sample_rate: 0, channels: 0 },
        {
          language: input.language,
          registry: ctx.registry,
          logger: ctx.logger,
          projectRoot: ctx.projectRoot,
        },
      );
      transcriptSegments = transcript.segments.map((segment) => ({
        text: segment.text,
        start_s: segment.start_s,
        end_s: segment.end_s,
      }));
    } catch (error) {
      if (!isTranscriptionUnavailable(error)) {
        throw error;
      }

      ctx.logger.warn("video_understand skipped transcription because no concrete transcriber was available", {
        reason: error instanceof Error ? error.message : String(error),
      });
    }

    return outputSchema.parse({
      summary: summarizeUnderstanding(frameResult.frames, transcriptSegments),
      frames: frameResult.frames,
      transcript_segments: transcriptSegments,
      duration_s: inferUnderstandingDuration(frameResult.frames, transcriptSegments),
    });
  },
});

export default videoUnderstand;

function isTranscriptionUnavailable(error: unknown): boolean {
  if (error instanceof NoToolAvailable) {
    return true;
  }

  const message = error instanceof Error ? error.message : String(error);
  return /binary not on PATH|missing env|not-authenticated|No tool available|unavailable:/iu.test(message);
}
