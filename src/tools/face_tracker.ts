import { readFile } from "node:fs/promises";
import { dirname, extname, join, basename } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";

const bboxSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});

const trackFrameSchema = z.object({
  frame: z.number().int().nonnegative(),
  bbox: bboxSchema,
});

const inputSchema = z.object({
  video_path: z.string().min(1),
});

const outputSchema = z.object({
  track: z.array(trackFrameSchema),
  cost_usd: z.number(),
});

export default defineTool({
  name: "face_tracker",
  capability: "face_tracker",
  provider: "local",
  status: "experimental",
  integration: { kind: "library", package: "node:fs", install: "built into Node.js" },
  best_for: "Reading fixture or sidecar face/object tracks for smart reframing.",
  supports: ["sidecar-track", "smart-crop-fixtures"],
  cost: { unit: "call", usd: 0 },
  input: inputSchema,
  output: outputSchema,
  async execute(params) {
    const input = inputSchema.parse(params);
    const sidecar = await readFirstSidecar(input.video_path);
    return outputSchema.parse({ track: sidecar, cost_usd: 0 });
  },
});

async function readFirstSidecar(videoPath: string): Promise<z.infer<typeof trackFrameSchema>[]> {
  const candidates = sidecarCandidates(videoPath);

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(await readFile(candidate, "utf8"));
      return parseTrack(parsed);
    } catch (error) {
      if (!isNodeError(error) || error.code !== "ENOENT") {
        throw error;
      }
    }
  }

  throw new Error(`face_tracker sidecar not found for ${videoPath}`);
}

function sidecarCandidates(videoPath: string): string[] {
  const extension = extname(videoPath);
  const withoutExtension = extension ? join(dirname(videoPath), basename(videoPath, extension)) : videoPath;
  return [`${videoPath}.track.json`, `${withoutExtension}.track.json`];
}

function parseTrack(value: unknown): z.infer<typeof trackFrameSchema>[] {
  if (Array.isArray(value)) {
    return z.array(trackFrameSchema).parse(value);
  }

  if (typeof value === "object" && value !== null && "track" in value) {
    return z.array(trackFrameSchema).parse((value as { track: unknown }).track);
  }

  if (typeof value === "object" && value !== null && "frames" in value) {
    return z.array(trackFrameSchema).parse((value as { frames: unknown }).frames);
  }

  throw new Error("face_tracker sidecar must be an array or contain track/frames");
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}
