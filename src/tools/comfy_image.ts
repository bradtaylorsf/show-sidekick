import { z } from "zod";
import { comfyToolAvailability, getComfyClient } from "../comfy/availability.js";
import { buildImageGraph, type ImageGraphInput } from "../comfy/graphs.js";
import { LICENCES } from "../comfy/models.js";
import {
  announceComfyRun,
  chooseEngine,
  filenamePrefix,
  randomSeed,
  resolveDimensions,
  runGraph,
  timeoutMs,
  toolRunPath,
} from "../comfy/run.js";
import { defineTool } from "../registry/define-tool.js";
import { resolveProjectReadPath } from "../tool-support/paths.js";

const IMAGE_ENGINES = ["z-image-turbo", "qwen-image-2.1", "qwen-image-edit-2511"] as const;

export const ComfyImageInputSchema = z.object({
  prompt: z.string().min(1),
  negative_prompt: z.string().optional(),
  engine: z.enum(IMAGE_ENGINES).optional(),
  speed: z.enum(["fast", "balanced", "quality"]).optional(),
  reference_images: z.array(z.string().min(1)).max(16).optional(),
  width: z.number().int().min(256).max(4096).optional(),
  height: z.number().int().min(256).max(4096).optional(),
  size: z.string().optional(),
  aspect_ratio: z.string().optional(),
  seed: z.number().int().min(0).optional(),
  steps: z.number().int().min(1).max(150).optional(),
  cfg: z.number().min(0).max(30).optional(),
  reference_resolution: z.number().int().min(256).max(4096).optional(),
  output_path: z.string().min(1).optional(),
  timeout_s: z.number().positive().optional(),
  sample: z.boolean().optional(),
});

export const ComfyImageOutputSchema = z.object({
  image_path: z.string(),
  provider: z.literal("comfyui"),
  engine: z.enum(IMAGE_ENGINES),
  model: z.string(),
  mode: z.enum(["text_to_image", "image_edit"]),
  cost_usd: z.literal(0),
  seed: z.number().int(),
  width: z.number().int().optional(),
  height: z.number().int().optional(),
  settings: z.record(z.string(), z.unknown()),
  provider_request_id: z.string(),
  elapsed_ms: z.number().nonnegative(),
  licence: z.string(),
});

export default defineTool({
  name: "comfy_image",
  capability: "image_generation",
  provider: "comfyui",
  status: "beta",
  integration: { kind: "api", env: [], install: "showkick setup comfy" },
  best_for:
    "Default local stills and image edits through your own ComfyUI: Z-Image-Turbo text-to-image, Qwen-Image-Edit-2511 edits with up to 3 reference images, Qwen-Image-2.1 (research licence). No provider charge.",
  supports: [
    "local-default",
    "local-gpu",
    "text-to-image",
    "image-edit",
    "reference-images",
    "z-image-turbo",
    "qwen-image-2.1",
    "qwen-image-edit-2511",
  ],
  cost: { unit: "image", usd: 0 },
  agent_skills: ["comfyui-local"],
  input: ComfyImageInputSchema,
  output: ComfyImageOutputSchema,
  isAvailable: () => comfyToolAvailability(getComfyClient(), "image"),
  async execute(params, ctx) {
    const input = ComfyImageInputSchema.parse(params);
    const client = getComfyClient();
    const references = (input.reference_images ?? []).map((path) => resolveProjectReadPath(path, ctx.projectRoot));
    const mode = references.length > 0 ? "image_edit" : "text_to_image";
    const choice = await chooseEngine(client, mode, input.engine);
    const engine = choice.engine.id as ImageGraphInput["engine"];
    const presentOptional = choice.status.presentOptionalFiles.map((file) => file.filename);
    const speed = assertSpeedAvailable(engine, input.speed ?? defaultSpeed(engine, presentOptional), presentOptional);
    const dims = resolveDimensions(input, { area: 1024 * 1024, multiple: engine === "qwen-image-2.1" ? 32 : 16 });
    const seed = input.seed ?? randomSeed();

    announceComfyRun(ctx, {
      tool: "comfy_image",
      engine: choice.engine,
      client,
      reason: mode === "image_edit" ? `Edit ${references.length} reference image(s) locally.` : "Generate a still locally.",
      sample: input.sample,
    });

    const uploaded: string[] = [];
    for (const path of references) {
      uploaded.push(await client.uploadFile(path, { subfolder: "show-sidekick" }));
    }

    const built = buildImageGraph({
      engine,
      prompt: input.prompt,
      negativePrompt: input.negative_prompt,
      width: dims.width,
      height: dims.height,
      seed,
      speed,
      steps: input.steps,
      cfg: input.cfg,
      referenceImages: uploaded,
      referenceResolution: input.reference_resolution,
      filenamePrefix: filenamePrefix(choice.engine.id),
    });

    const result = await runGraph(client, built, {
      outputPath: toolRunPath(ctx, "image", `comfy-${choice.engine.id}`, input.output_path),
      timeoutMs: timeoutMs(input.timeout_s, 900),
      warn: (message) => ctx.logger.warn(message),
    });

    return ComfyImageOutputSchema.parse({
      image_path: result.outputPath,
      provider: "comfyui",
      engine,
      model: choice.engine.model,
      mode,
      cost_usd: 0,
      seed,
      ...(mode === "text_to_image" ? dims : {}),
      settings: built.settings,
      provider_request_id: result.promptId,
      elapsed_ms: result.elapsedMs,
      licence: LICENCES[choice.engine.licence].label,
    });
  },
});

const SPEED_LORAS: Partial<Record<string, string>> = {
  "qwen-image-2.1:fast": "qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors",
  "qwen-image-2.1:balanced": "qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors",
  "qwen-image-edit-2511:fast": "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
  "qwen-image-edit-2511:balanced": "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
};

/** Fastest speed whose LoRA is installed; base "quality" sampling when none is. */
export function defaultSpeed(engine: ImageGraphInput["engine"], presentOptional: string[]): "fast" | "balanced" | "quality" {
  for (const speed of ["fast", "balanced"] as const) {
    const required = SPEED_LORAS[`${engine}:${speed}`];
    if (required === undefined || presentOptional.includes(required)) {
      return speed;
    }
  }
  return "quality";
}

/** Fast modes ride on optional LoRAs; refuse a fast mode whose LoRA is not installed instead of silently running base. */
export function assertSpeedAvailable(
  engine: ImageGraphInput["engine"],
  speed: "fast" | "balanced" | "quality",
  presentOptional: string[],
): "fast" | "balanced" | "quality" {
  const required = SPEED_LORAS[`${engine}:${speed}`];
  if (required !== undefined && !presentOptional.includes(required)) {
    throw new Error(`${engine} speed "${speed}" needs loras/${required}; download it with \`showkick setup comfy --engines ${engine}\` or pass speed "quality"`);
  }
  return speed;
}
