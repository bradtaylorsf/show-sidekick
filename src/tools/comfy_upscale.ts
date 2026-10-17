import { z } from "zod";
import { comfyToolAvailability, getComfyClient } from "../comfy/availability.js";
import { buildUpscaleImageGraph, buildUpscaleVideoGraph, type SeedVr2Engine, type SeedVr2Settings } from "../comfy/graphs.js";
import { mediaKind, probeVideoSize, readImageSize, type Size } from "../comfy/media.js";
import { ENGINES, LICENCES, type EngineDefinition } from "../comfy/models.js";
import { announceComfyRun, chooseEngine, comboOptions, filenamePrefix, runGraph, timeoutMs, toolRunPath } from "../comfy/run.js";
import { defineTool } from "../registry/define-tool.js";
import { resolveProjectReadPath } from "../tool-support/paths.js";

/**
 * SeedVR2 over-sharpens 720p AI clips when pushed hard, so the defaults are modest:
 * 2x for stills, 1.5x for video, with an opt-in downscale-before-restore.
 */
const DEFAULT_IMAGE_SCALE = 2;
const DEFAULT_VIDEO_SCALE = 1.5;

export const ComfyUpscaleInputSchema = z.object({
  source_path: z.string().min(1),
  output_path: z.string().min(1).optional(),
  /** Output short edge = source short edge x scale (after any pre_downscale). */
  scale: z.number().min(1).max(4).optional(),
  /** Absolute target short edge in pixels; overrides scale. */
  resolution: z.number().int().min(64).max(8192).optional(),
  max_resolution: z.number().int().min(0).max(16384).optional(),
  engine: z.enum(["seedvr2-3b", "seedvr2-7b-q8"]).optional(),
  /** Shorthand for engine seedvr2-7b-q8. */
  quality: z.boolean().optional(),
  /** Shrink the source first (0.25–1); SeedVR2 restores cleaner from a softer input. */
  pre_downscale: z.number().min(0.25).max(1).optional(),
  /** Video only: RIFE 4.7 frame interpolation after restore (true = 2x frames). */
  interpolate: z.union([z.boolean(), z.object({ multiplier: z.number().int().min(2).max(4) })]).optional(),
  /** Video only: interpolate frames without running SeedVR2. */
  interpolate_only: z.boolean().optional(),
  color_correction: z.enum(["lab", "wavelet", "wavelet_adaptive", "hsv", "adain", "none"]).optional(),
  seed: z.number().int().min(0).optional(),
  /** Video only: frames per SeedVR2 batch (4n+1). */
  batch_size: z.number().int().min(1).max(129).optional(),
  temporal_overlap: z.number().int().min(0).max(16).optional(),
  timeout_s: z.number().positive().optional(),
});

export const ComfyUpscaleOutputSchema = z.object({
  output_path: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  cost_usd: z.literal(0),
  provider_metadata: z.record(z.string(), z.unknown()).default({}),
});

export default defineTool({
  name: "comfy_upscale",
  capability: "upscale",
  provider: "comfyui",
  status: "beta",
  integration: { kind: "api", env: [], install: "showkick setup comfy" },
  best_for:
    "Default local restore-upscale for stills and clips through your own ComfyUI: SeedVR2 3B (fp16) or 7B (Q8 GGUF, quality), plus RIFE 4.7 frame interpolation. Conservative defaults. No provider charge.",
  supports: ["local-default", "local-gpu", "upscale", "resolution-enhancement", "seedvr2", "frame-interpolation", "rife"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["comfyui-local"],
  input: ComfyUpscaleInputSchema,
  output: ComfyUpscaleOutputSchema,
  isAvailable: () => comfyToolAvailability(getComfyClient(), "upscale"),
  async execute(params, ctx) {
    const input = ComfyUpscaleInputSchema.parse(params);
    const client = getComfyClient();
    const sourcePath = resolveProjectReadPath(input.source_path, ctx.projectRoot);
    const kind = mediaKind(sourcePath);
    if (kind === undefined) {
      throw new Error(`comfy_upscale cannot tell whether ${input.source_path} is an image or a video from its extension`);
    }

    const interpolate = input.interpolate_only === true ? (input.interpolate ?? true) : input.interpolate;
    if (kind === "image" && (interpolate !== undefined && interpolate !== false)) {
      throw new Error("frame interpolation applies to video sources only");
    }

    const restore = input.interpolate_only !== true;
    const requested: SeedVr2Engine | undefined = input.engine ?? (input.quality === true ? "seedvr2-7b-q8" : undefined);
    const restoreChoice = restore ? await chooseEngine(client, kind === "image" ? "upscale_image" : "upscale_video", requested) : undefined;
    const interpolateChoice =
      interpolate !== undefined && interpolate !== false ? await chooseEngine(client, "interpolate", "rife-4.7") : undefined;
    const announced: EngineDefinition = restoreChoice?.engine ?? interpolateChoice?.engine ?? ENGINES["seedvr2-3b"];

    const sourceSize = kind === "image" ? await readImageSize(sourcePath) : await probeVideoSize(sourcePath);
    const scale = input.scale ?? (kind === "image" ? DEFAULT_IMAGE_SCALE : DEFAULT_VIDEO_SCALE);
    const target = restore ? targetResolution(sourceSize, input.resolution, scale) : undefined;
    const outputSize = target === undefined ? sourceSize : scaledSize(sourceSize, target);

    let settings: SeedVr2Settings | undefined;
    if (restoreChoice !== undefined && target !== undefined) {
      const objectInfo = await client.objectInfo();
      const device = comboOptions(objectInfo.SeedVR2LoadDiTModel, "device")[0];
      if (device === undefined) {
        throw new Error("SeedVR2LoadDiTModel reports no inference device; check the ComfyUI log");
      }
      settings = {
        engine: restoreChoice.engine.id as SeedVr2Engine,
        resolution: target,
        maxResolution: input.max_resolution,
        preDownscale: input.pre_downscale,
        seed: input.seed ?? 42,
        device,
        colorCorrection: input.color_correction,
        batchSize: kind === "video" ? (input.batch_size ?? 5) : 1,
        temporalOverlap: input.temporal_overlap,
      };
    }

    announceComfyRun(ctx, {
      tool: "comfy_upscale",
      engine: announced,
      client,
      reason:
        kind === "image"
          ? `Restore-upscale a still to ${target ?? "?"}px short edge locally.`
          : `${restore ? `Restore-upscale a clip to ${target ?? "?"}px short edge` : "Interpolate a clip"}${interpolateChoice !== undefined && restore ? " and interpolate frames" : ""} locally.`,
    });

    const uploaded = await client.uploadFile(sourcePath, { subfolder: "show-sidekick" });
    const multiplier = typeof interpolate === "object" ? interpolate.multiplier : 2;
    const built =
      kind === "image"
        ? buildUpscaleImageGraph({ ...(settings as SeedVr2Settings), image: uploaded, filenamePrefix: filenamePrefix(announced.id) })
        : buildUpscaleVideoGraph({
            video: uploaded,
            seedvr2: settings,
            interpolate: interpolateChoice === undefined ? undefined : { multiplier },
            filenamePrefix: filenamePrefix(announced.id),
          });

    const result = await runGraph(client, built, {
      outputPath: toolRunPath(ctx, "upscale", `comfy-${announced.id}`, input.output_path),
      timeoutMs: timeoutMs(input.timeout_s, kind === "image" ? 900 : 3_600),
      warn: (message) => ctx.logger.warn(message),
    });

    return ComfyUpscaleOutputSchema.parse({
      output_path: result.outputPath,
      ...(outputSize === undefined ? {} : outputSize),
      cost_usd: 0,
      provider_metadata: {
        provider: "comfyui",
        engine: announced.id,
        model: announced.model,
        interpolation: interpolateChoice === undefined ? null : { engine: "rife-4.7", multiplier },
        source_size: sourceSize ?? null,
        settings: built.settings,
        provider_request_id: result.promptId,
        elapsed_ms: result.elapsedMs,
        licence: LICENCES[announced.licence].label,
      },
    });
  },
});

/** Target short edge: explicit resolution, else source short edge x scale (after pre-downscale is accounted for by SeedVR2's resize). */
export function targetResolution(source: Size | undefined, resolution: number | undefined, scale: number): number {
  if (resolution !== undefined) {
    return resolution;
  }
  if (source === undefined) {
    throw new Error("could not read the source size; pass resolution (target short edge in pixels)");
  }
  return Math.round(Math.min(source.width, source.height) * scale);
}

function scaledSize(source: Size | undefined, shortEdge: number): Size | undefined {
  if (source === undefined) {
    return undefined;
  }
  const ratio = shortEdge / Math.min(source.width, source.height);
  const even = (value: number) => {
    const rounded = Math.round(value);
    return rounded % 2 === 0 ? rounded : rounded + 1;
  };
  return { width: even(source.width * ratio), height: even(source.height * ratio) };
}
