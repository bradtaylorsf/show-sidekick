import { mkdir } from "node:fs/promises";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import type { ToolContext } from "../registry/tool.js";
import { defaultRunCli } from "../tool-support/cli-runner.js";

type BBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type TrackFrame = {
  frame: number;
  bbox: BBox;
};

const inputSchema = z.object({
  video_path: z.string().min(1),
  target_aspect: z.string().min(1).default("9:16"),
  output_path: z.string().min(1).optional(),
});

const outputSchema = z.object({
  video_path: z.string(),
  target_aspect: z.string(),
  cost_usd: z.number(),
});

export default defineTool({
  name: "auto_reframe",
  capability: "auto_reframe",
  provider: "local",
  status: "beta",
  integration: { kind: "binary", binary: "ffmpeg", install: "brew install ffmpeg" },
  best_for: "Reframing landscape clips into vertical or square deliverables with face/object-aware smart crop.",
  supports: ["ffmpeg", "smart-crop", "9:16", "1:1", "4:5"],
  cost: { unit: "call", usd: 0 },
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const inputPath = resolveProjectPath(input.video_path, ctx.projectRoot);
    const outputPath = resolveOutputPath(input.output_path, inputPath, input.target_aspect, ctx.projectRoot);
    await mkdir(dirname(outputPath), { recursive: true });

    const track = await loadTrack(inputPath, ctx);
    const subjectCenterX = track.length > 0 ? String(average(smoothedCenters(track))) : "iw/2";
    const filter = buildFilter(input.target_aspect, subjectCenterX);
    const runner = ctx.runCli ?? defaultRunCli;

    await runner(
      "ffmpeg",
      ["-y", "-i", inputPath, "-vf", filter, "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "copy", outputPath],
      { cwd: ctx.projectRoot },
    );

    return outputSchema.parse({ video_path: outputPath, target_aspect: input.target_aspect, cost_usd: 0 });
  },
});

async function loadTrack(videoPath: string, ctx: ToolContext): Promise<TrackFrame[]> {
  if (!ctx.registry) {
    ctx.logger.warn("face_tracker capability unavailable; using center crop fallback");
    return [];
  }

  try {
    const faceTracker = await ctx.registry.select("face_tracker");
    return readTrack(await faceTracker.execute({ video_path: videoPath }, ctx));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.logger.warn("face_tracker capability unavailable; using center crop fallback", { error: message });
    return [];
  }
}

function readTrack(output: unknown): TrackFrame[] {
  const frames = Array.isArray(output) ? output : isRecord(output) && Array.isArray(output.track) ? output.track : isRecord(output) && Array.isArray(output.frames) ? output.frames : [];

  return frames.flatMap((frame, index) => {
    if (!isRecord(frame)) {
      return [];
    }

    const bbox = readBBox(frame.bbox);

    if (!bbox) {
      return [];
    }

    return [{ frame: typeof frame.frame === "number" ? frame.frame : index, bbox }];
  });
}

function readBBox(value: unknown): BBox | undefined {
  if (Array.isArray(value) && value.length >= 4) {
    const [x, y, width, height] = value;
    if ([x, y, width, height].every((item) => typeof item === "number")) {
      return { x, y, width, height };
    }
  }

  if (isRecord(value)) {
    const x = value.x;
    const y = value.y;
    const width = value.width ?? value.w;
    const height = value.height ?? value.h;

    if ([x, y, width, height].every((item) => typeof item === "number")) {
      return { x, y, width, height } as BBox;
    }
  }

  return undefined;
}

function smoothedCenters(track: TrackFrame[]): number[] {
  const centers = track.map((frame) => frame.bbox.x + frame.bbox.width / 2);

  return centers.map((_center, index) => {
    const window = centers.slice(Math.max(0, index - 1), Math.min(centers.length, index + 2));
    return average(window);
  });
}

function buildFilter(targetAspect: string, subjectCenterX: string): string {
  const aspect = parseAspect(targetAspect);
  const ratioExpression = `${aspect.width}/${aspect.height}`;

  if (aspect.ratio <= 1) {
    const cropWidth = `ih*${ratioExpression}`;
    const x = `min(max(0,${subjectCenterX}-(${cropWidth})/2),iw-(${cropWidth}))`;
    return `crop=${cropWidth}:ih:'${x}':0,scale=${scaleWidth(aspect.ratio)}:${scaleHeight(aspect.ratio)}`;
  }

  const cropHeight = `iw/${ratioExpression}`;
  const y = `min(max(0,ih/2-(${cropHeight})/2),ih-(${cropHeight}))`;
  return `crop=iw:${cropHeight}:0:'${y}',scale=${scaleWidth(aspect.ratio)}:${scaleHeight(aspect.ratio)}`;
}

function parseAspect(targetAspect: string): { width: number; height: number; ratio: number } {
  const parts = targetAspect.split(":");

  if (parts.length !== 2) {
    throw new Error(`target_aspect must be width:height, received ${targetAspect}`);
  }

  const width = Number(parts[0]);
  const height = Number(parts[1]);

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`target_aspect must be width:height, received ${targetAspect}`);
  }

  return { width, height, ratio: width / height };
}

function scaleWidth(ratio: number): number {
  return ratio <= 1 ? 1080 : Math.round(1080 * ratio);
}

function scaleHeight(ratio: number): number {
  return ratio <= 1 ? Math.round(1080 / ratio) : 1080;
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function resolveProjectPath(path: string, projectRoot: string): string {
  return isAbsolute(path) ? path : resolve(projectRoot, path);
}

function resolveOutputPath(outputPath: string | undefined, inputPath: string, targetAspect: string, projectRoot: string): string {
  if (outputPath) {
    return resolveProjectPath(outputPath, projectRoot);
  }

  const extension = extname(inputPath) || ".mp4";
  const base = basename(inputPath, extension);
  const safeAspect = targetAspect.replace(/[^a-zA-Z0-9]+/g, "x");
  return join(projectRoot, "projects", "_tool_runs", "auto_reframe", `${base}-${safeAspect}${extension}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
