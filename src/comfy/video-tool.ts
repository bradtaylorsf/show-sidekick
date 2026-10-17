import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { ToolContext } from "../registry/tool.js";
import { resolveProjectReadPath } from "../tool-support/paths.js";
import { getComfyClient } from "./availability.js";
import { buildVideoGraph, type VideoGraphInput, type VideoMode } from "./graphs.js";
import { LICENCES, MODEL_FILES } from "./models.js";
import {
  announceComfyRun,
  chooseEngine,
  filenamePrefix,
  randomSeed,
  resolveDimensions,
  runGraph,
  timeoutMs,
  toolRunPath,
} from "./run.js";

export const VIDEO_ENGINES = ["wan2.2-ti2v-5b", "wan2.2-i2v-a14b", "ltx-2.5"] as const;

export const ComfyVideoInputSchema = z.object({
  prompt: z.string().min(1),
  negative_prompt: z.string().optional(),
  engine: z.enum(VIDEO_ENGINES).optional(),
  mode: z.enum(["image_to_video", "text_to_video", "first_last_frame"]).optional(),
  image_path: z.string().min(1).optional(),
  /** Only local files (a path or file:// URL); remote URLs are not fetched. */
  image_url: z.string().min(1).optional(),
  end_image_path: z.string().min(1).optional(),
  duration: z.number().positive().max(10).optional(),
  frames: z.number().int().min(9).max(481).optional(),
  fps: z.number().int().min(8).max(60).optional(),
  aspect_ratio: z.string().optional(),
  size: z.string().optional(),
  width: z.number().int().min(256).max(2048).optional(),
  height: z.number().int().min(256).max(2048).optional(),
  seed: z.number().int().min(0).optional(),
  steps: z.number().int().min(1).max(100).optional(),
  cfg: z.number().min(0).max(30).optional(),
  /** LTX-2.5: half-res pass + x2 latent upscaler. Defaults on when the upscaler file is installed. */
  upscale: z.boolean().optional(),
  output_path: z.string().min(1).optional(),
  timeout_s: z.number().positive().optional(),
  sample: z.boolean().optional(),
});

export type ComfyVideoInput = z.infer<typeof ComfyVideoInputSchema>;

export const ComfyVideoOutputSchema = z.object({
  video_path: z.string(),
  provider: z.literal("comfyui"),
  engine: z.enum(VIDEO_ENGINES),
  model: z.string(),
  mode: z.enum(["image_to_video", "text_to_video", "first_last_frame"]),
  cost_usd: z.literal(0),
  provider_request_id: z.string(),
  seed: z.number().int(),
  width: z.number().int(),
  height: z.number().int(),
  frames: z.number().int(),
  fps: z.number().int(),
  has_audio: z.boolean(),
  settings: z.record(z.string(), z.unknown()),
  elapsed_ms: z.number().nonnegative(),
  licence: z.string(),
});

export type ComfyVideoOutput = z.infer<typeof ComfyVideoOutputSchema>;

type EngineVideoDefaults = { fps: number; frameMultiple: number; area: number; multiple: number; native: { width: number; height: number } };

const VIDEO_DEFAULTS: Record<(typeof VIDEO_ENGINES)[number], EngineVideoDefaults> = {
  // 1280x704 is the 5B's native 720p size; 121 frames at 24 fps = 5 s.
  "wan2.2-ti2v-5b": { fps: 24, frameMultiple: 4, area: 1280 * 704, multiple: 32, native: { width: 1280, height: 704 } },
  // 14B I2V at 480p keeps a Mac job in minutes, not hours; 81 frames at 16 fps = 5 s.
  "wan2.2-i2v-a14b": { fps: 16, frameMultiple: 4, area: 832 * 480, multiple: 16, native: { width: 832, height: 480 } },
  // Multiple of 64 so the two-stage half-res pass stays on a 32-pixel grid.
  "ltx-2.5": { fps: 24, frameMultiple: 8, area: 1280 * 704, multiple: 64, native: { width: 1280, height: 704 } },
};

export async function runComfyVideo(
  rawParams: unknown,
  ctx: ToolContext,
  options: { tool: string; forceMode?: VideoMode },
): Promise<ComfyVideoOutput> {
  const input = ComfyVideoInputSchema.parse(rawParams);
  const client = getComfyClient();
  const startImage = localImage(input.image_path ?? input.image_url, ctx.projectRoot);
  const endImage = localImage(input.end_image_path, ctx.projectRoot);
  const mode: VideoMode =
    options.forceMode ?? input.mode ?? (endImage !== undefined ? "first_last_frame" : startImage !== undefined ? "image_to_video" : "text_to_video");

  if (options.forceMode === "text_to_video" && (startImage !== undefined || endImage !== undefined)) {
    throw new Error(`${options.tool} is text-to-video only; use comfy_video for image-to-video`);
  }
  if (mode !== "text_to_video" && startImage === undefined) {
    throw new Error(`${options.tool} ${mode} needs image_path (a local file)`);
  }
  if (mode === "first_last_frame" && endImage === undefined) {
    throw new Error(`${options.tool} first_last_frame needs end_image_path`);
  }

  const choice = await chooseEngine(client, mode, input.engine);
  const engine = choice.engine.id as VideoGraphInput["engine"];
  const defaults = VIDEO_DEFAULTS[engine];
  const fps = input.fps ?? defaults.fps;
  const frames = input.frames ?? framesFor(input.duration ?? 5, fps, defaults.frameMultiple);
  const dims = videoDimensions(input, defaults);
  const seed = input.seed ?? randomSeed();
  const upscalerPresent = choice.status.presentOptionalFiles.some((file) => file.filename === MODEL_FILES.ltxSpatialUpscaler.filename);
  if (engine === "ltx-2.5" && input.upscale === true && !upscalerPresent) {
    throw new Error(
      `ltx-2.5 upscale needs latent_upscale_models/${MODEL_FILES.ltxSpatialUpscaler.filename}; download it with \`showkick setup comfy --engines ltx-2.5\` or pass upscale: false`,
    );
  }

  announceComfyRun(ctx, {
    tool: options.tool,
    engine: choice.engine,
    client,
    reason: `Generate a ${Math.round((frames / fps) * 10) / 10}s ${mode.replaceAll("_", "-")} clip locally.`,
    sample: input.sample,
  });

  const uploadedStart = startImage === undefined ? undefined : await client.uploadFile(startImage, { subfolder: "show-sidekick" });
  const uploadedEnd = endImage === undefined ? undefined : await client.uploadFile(endImage, { subfolder: "show-sidekick" });
  const built = buildVideoGraph({
    engine,
    mode,
    prompt: input.prompt,
    negativePrompt: input.negative_prompt,
    width: dims.width,
    height: dims.height,
    frames,
    fps,
    seed,
    steps: input.steps,
    cfg: input.cfg,
    startImage: uploadedStart,
    endImage: uploadedEnd,
    ltxUpscale: engine === "ltx-2.5" ? (input.upscale ?? upscalerPresent) : undefined,
    filenamePrefix: filenamePrefix(choice.engine.id),
  });

  const result = await runGraph(client, built, {
    outputPath: toolRunPath(ctx, "video", `comfy-${choice.engine.id}`, input.output_path),
    timeoutMs: timeoutMs(input.timeout_s, 3_600),
    warn: (message) => ctx.logger.warn(message),
  });

  return ComfyVideoOutputSchema.parse({
    video_path: result.outputPath,
    provider: "comfyui",
    engine,
    model: choice.engine.model,
    mode,
    cost_usd: 0,
    provider_request_id: result.promptId,
    seed,
    width: dims.width,
    height: dims.height,
    frames,
    fps,
    has_audio: engine === "ltx-2.5",
    settings: built.settings,
    elapsed_ms: result.elapsedMs,
    licence: LICENCES[choice.engine.licence].label,
  });
}

/** The engine's native landscape/portrait size when the caller gives no size, else the asked size on the engine's grid. */
function videoDimensions(input: ComfyVideoInput, defaults: EngineVideoDefaults): { width: number; height: number } {
  if (input.width === undefined && input.height === undefined && input.size === undefined) {
    const aspect = input.aspect_ratio?.trim();
    if (aspect === undefined || aspect === "16:9") {
      return { ...defaults.native };
    }
    if (aspect === "9:16") {
      return { width: defaults.native.height, height: defaults.native.width };
    }
  }

  return resolveDimensions(input, { area: defaults.area, multiple: defaults.multiple, aspect: 16 / 9 });
}

/** Frames for a duration, on the engine's 4n+1 (Wan) or 8n+1 (LTX) grid. */
export function framesFor(seconds: number, fps: number, multiple: number): number {
  return Math.max(1, Math.round((seconds * fps) / multiple)) * multiple + 1;
}

function localImage(value: string | undefined, projectRoot: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value.startsWith("file://")) {
    return fileURLToPath(value);
  }
  if (/^https?:\/\//iu.test(value)) {
    throw new Error("ComfyUI video tools take a local image file (image_path); download the remote image first");
  }
  return resolveProjectReadPath(value, projectRoot);
}
