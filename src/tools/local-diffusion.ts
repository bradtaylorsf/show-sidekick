import { access } from "node:fs/promises";
import { z } from "zod";
import { generatedAssetPath } from "../media/generated-path.js";
import { binaryOnPath, runCommand } from "../media/process.js";
import { defineTool } from "../registry/index.js";
import type { Availability } from "../registry/index.js";

const LOCAL_DIFFUSION_SCRIPT = String.raw`
import argparse

parser = argparse.ArgumentParser()
parser.add_argument("--model", required=True)
parser.add_argument("--prompt", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--negative-prompt")
parser.add_argument("--width", type=int, default=1024)
parser.add_argument("--height", type=int, default=1024)
parser.add_argument("--steps", type=int, default=30)
parser.add_argument("--guidance-scale", type=float, default=7.0)
parser.add_argument("--seed", type=int)
args = parser.parse_args()

import torch
from diffusers import StableDiffusionPipeline, StableDiffusionXLPipeline

pipeline_class = StableDiffusionXLPipeline if "xl" in args.model.lower() or "sdxl" in args.model.lower() else StableDiffusionPipeline
pipe = pipeline_class.from_pretrained(args.model, torch_dtype=torch.float16 if torch.cuda.is_available() else torch.float32)
if torch.cuda.is_available():
    pipe = pipe.to("cuda")

generator = None
if args.seed is not None:
    generator = torch.Generator(device="cuda" if torch.cuda.is_available() else "cpu").manual_seed(args.seed)

image = pipe(
    prompt=args.prompt,
    negative_prompt=args.negative_prompt,
    width=args.width,
    height=args.height,
    num_inference_steps=args.steps,
    guidance_scale=args.guidance_scale,
    generator=generator,
).images[0]
image.save(args.output)
`;

export const LocalDiffusionInputSchema = z.object({
  prompt: z.string().min(1),
  negative_prompt: z.string().optional(),
  width: z.number().int().positive().default(1024),
  height: z.number().int().positive().default(1024),
  steps: z.number().int().positive().default(30),
  guidance_scale: z.number().positive().default(7),
  seed: z.number().int().nonnegative().optional(),
  model: z.string().optional(),
});

export const LocalDiffusionOutputSchema = z.object({
  image_path: z.string(),
  provider: z.literal("local"),
  model: z.string(),
  cost_usd: z.literal(0),
  seed: z.number().int().nonnegative().optional(),
});

export default defineTool({
  name: "local_diffusion",
  capability: "image_generation",
  provider: "local",
  status: "experimental",
  integration: {
    kind: "binary",
    binary: "python3",
    install: "pip install diffusers torch accelerate; set PREDIT_LOCAL_SD_MODEL to a local SD/SDXL model path.",
  },
  best_for: "local SD/SDXL image generation on machines with a local model and LOCAL_GPU runtime",
  supports: ["sd15", "sdxl", "LOCAL_GPU"],
  cost: { unit: "image", usd: 0 },
  input: LocalDiffusionInputSchema,
  output: LocalDiffusionOutputSchema,
  isAvailable: async () => localDiffusionAvailability(),

  async execute(params, ctx) {
    const input = LocalDiffusionInputSchema.parse(params);
    const model = input.model ?? process.env.PREDIT_LOCAL_SD_MODEL;
    if (!model) {
      throw new Error("missing env: PREDIT_LOCAL_SD_MODEL");
    }
    await access(model);

    const outputPath = await generatedAssetPath(ctx, { extension: "png" });
    const args = [
      "-c",
      LOCAL_DIFFUSION_SCRIPT,
      "--model",
      model,
      "--prompt",
      input.prompt,
      "--output",
      outputPath,
      "--width",
      String(input.width),
      "--height",
      String(input.height),
      "--steps",
      String(input.steps),
      "--guidance-scale",
      String(input.guidance_scale),
    ];

    if (input.negative_prompt) {
      args.push("--negative-prompt", input.negative_prompt);
    }
    if (input.seed !== undefined) {
      args.push("--seed", String(input.seed));
    }

    await runCommand("python3", args, { cwd: ctx.projectRoot });

    return LocalDiffusionOutputSchema.parse({
      image_path: outputPath,
      provider: "local",
      model,
      cost_usd: 0,
      seed: input.seed,
    });
  },
});

async function localDiffusionAvailability(): Promise<Availability> {
  if (!(await binaryOnPath("python3"))) {
    return { available: false, reason: "binary not on PATH: python3", fix: "install" };
  }

  const model = process.env.PREDIT_LOCAL_SD_MODEL;
  if (!model || model.trim() === "") {
    return { available: false, reason: "missing env: PREDIT_LOCAL_SD_MODEL", fix: "env" };
  }

  try {
    await access(model);
    return { available: true };
  } catch {
    return { available: false, reason: `local diffusion model not found: ${model}`, fix: "manual" };
  }
}
