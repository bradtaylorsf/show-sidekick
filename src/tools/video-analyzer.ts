import { mkdir, mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { VideoAnalysisBriefSchema, type MotionType, type VideoAnalysisBrief } from "../artifacts/index.js";
import { defineTool, type ToolContext } from "../registry/index.js";
import { resolveProjectReadPath } from "../tool-support/paths.js";
import frameSampler from "./frame-sampler.js";
import sceneDetector from "./scene-detector.js";
import { probeMediaFile } from "./source-media-review.js";
import videoDownloader from "./video-downloader.js";

const inputSchema = z.object({
  path: z.string().min(1),
  frames_per_scene: z.number().int().positive().default(2),
  output_dir: z.string().min(1).optional(),
});

type VideoAnalyzerInput = z.infer<typeof inputSchema>;

type SceneRange = {
  index: number;
  start_s: number;
  end_s: number;
};

export function isRemoteVideoSource(path: string): boolean {
  try {
    const url = new URL(path);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function classifyMotionType(probe: Record<string, unknown>): MotionType {
  const mediaKind = typeof probe.media_kind === "string" ? probe.media_kind : "unknown";
  const durationS = numericProbeField(probe, "duration_s");
  const nbFrames = numericProbeField(probe, "nb_frames");

  if (mediaKind === "image" || (nbFrames !== undefined && nbFrames <= 1)) {
    return "static_image";
  }
  if (durationS !== undefined && durationS < 1) {
    return "animated_still";
  }

  return "motion_clip";
}

export function buildVideoAnalysisBrief(scenes: SceneRange[], probe: Record<string, unknown>): VideoAnalysisBrief {
  const motionType = classifyMotionType(probe);
  const sceneRanges = scenes.length > 0 ? scenes : [{ index: 0, start_s: 0, end_s: numericProbeField(probe, "duration_s") ?? 0 }];
  const averageDuration =
    sceneRanges.reduce((total, scene) => total + Math.max(0, scene.end_s - scene.start_s), 0) / sceneRanges.length;
  const framing = spatialFraming(probe);

  return VideoAnalysisBriefSchema.parse({
    scenes: sceneRanges.map((scene) => ({
      scene_ref: `scene-${scene.index}`,
      subject: ["unclassified_subject"],
      subject_motion: [motionType === "static_image" ? "static" : "unclassified_motion"],
      scene: [typeof probe.media_kind === "string" ? `${probe.media_kind}_source` : "source_media"],
      spatial_framing: [framing],
      camera: [motionType === "static_image" ? "static_camera" : "unclassified_camera"],
      motion_type: motionType,
      flow_variance: flowVarianceForScene(scene, averageDuration),
    })),
  });
}

export function flowVarianceForScene(scene: SceneRange, averageDuration: number): number {
  const duration = Math.max(0, scene.end_s - scene.start_s);

  if (averageDuration <= 0) {
    return 0;
  }

  return roundTo(Math.abs(duration - averageDuration) / averageDuration, 3);
}

function spatialFraming(probe: Record<string, unknown>): string {
  const width = numericProbeField(probe, "width");
  const height = numericProbeField(probe, "height");

  if (width === undefined || height === undefined || height === 0) {
    return "unknown_framing";
  }

  const ratio = width / height;
  if (ratio >= 1.7) {
    return "wide_frame";
  }
  if (ratio <= 0.9) {
    return "vertical_frame";
  }

  return "standard_frame";
}

function numericProbeField(probe: Record<string, unknown>, field: string): number | undefined {
  const value = probe[field];

  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function roundTo(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const videoAnalyzer = defineTool({
  name: "video_analyzer",
  capability: "video_analysis",
  provider: "predit",
  status: "beta",
  integration: {
    kind: "library",
    package: "predit",
    install: "pnpm add predit",
  },
  best_for: "reference-driven source video analysis briefs for scene planning and QA",
  supports: ["scene-detection", "frame-sampling", "five-aspect-breakdown"],
  input: inputSchema,
  output: VideoAnalysisBriefSchema,
  isAvailable: async () => ({ available: true }),
  async execute(params: VideoAnalyzerInput, ctx: ToolContext): Promise<VideoAnalysisBrief> {
    const input = inputSchema.parse(params);
    const toolRunDir = join(ctx.projectRoot, "projects", "_tool_runs");
    await mkdir(toolRunDir, { recursive: true });
    const workDir = input.output_dir ?? (await mkdtemp(join(toolRunDir, "video-analysis-")));
    const sourcePath = isRemoteVideoSource(input.path)
      ? (
          await videoDownloader.execute(
            {
              url: input.path,
              output_dir: workDir,
              format: "mp4",
            },
            ctx,
          )
        ).path
      : resolveProjectReadPath(input.path, ctx.projectRoot);
    const probe = await probeMediaFile(sourcePath);
    const sceneResult = await sceneDetector.execute({ path: sourcePath, threshold: 0.3 }, ctx);

    await frameSampler.execute(
      {
        path: sourcePath,
        count: Math.max(1, sceneResult.scenes.length * input.frames_per_scene),
        mode: "scene_aware",
        output_dir: join(workDir, "frames"),
      },
      ctx,
    );

    return buildVideoAnalysisBrief(sceneResult.scenes, probe);
  },
});

export default videoAnalyzer;
