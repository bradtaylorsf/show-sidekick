import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { responseBytes, writeGeneratedImage } from "../media/generated-image.js";
import { defineTool } from "../registry/index.js";
import { defaultRunCli } from "../tool-support/cli-runner.js";

const HIGGSFIELD_IMAGE_COST_USD = 0.04;
const MODEL = "gpt_image_2";

export const HiggsfieldImageInputSchema = z.object({
  prompt: z.string().min(1),
  aspect_ratio: z.enum(["1:1", "4:3", "3:4", "16:9", "9:16", "3:2", "2:3"]).default("16:9"),
  quality: z.enum(["low", "medium", "high"]).default("low"),
  resolution: z.enum(["1k", "2k", "4k"]).default("2k"),
});

export const HiggsfieldImageOutputSchema = z.object({
  image_path: z.string(),
  url: z.string().url().optional(),
  provider: z.literal("higgsfield"),
  model: z.literal(MODEL),
  cost_usd: z.number().nonnegative(),
});

export default defineTool({
  name: "higgsfield_image",
  capability: "image_generation",
  provider: "higgsfield",
  status: "beta",
  integration: {
    kind: "cli",
    binary: "higgsfield",
    auth: { mode: "cli-login", check: "higgsfield account status --json" },
    install: "npm i -g @higgsfield/cli && higgsfield auth login",
  },
  best_for: "GPT Image 2 still-frame generation through the Higgsfield CLI.",
  supports: ["gpt_image_2", "text-to-image", "still-assets"],
  cost: { unit: "image", usd: HIGGSFIELD_IMAGE_COST_USD },
  agent_skills: ["higgsfield-generate"],
  input: HiggsfieldImageInputSchema,
  output: HiggsfieldImageOutputSchema,

  async execute(params, ctx) {
    const input = HiggsfieldImageInputSchema.parse(params);
    const runner = ctx.runCli ?? defaultRunCli;
    const result = await runner(
      "higgsfield",
      [
        "generate",
        "create",
        MODEL,
        "--prompt",
        input.prompt,
        "--aspect_ratio",
        input.aspect_ratio,
        "--quality",
        input.quality,
        "--resolution",
        input.resolution,
        "--wait",
        "--json",
      ],
      { cwd: ctx.projectRoot },
    );
    const reference = readImageReference(result.stdout);
    const bytes = await readImageBytes(reference, ctx.projectRoot);
    const imagePath = await writeGeneratedImage(ctx, bytes);

    return HiggsfieldImageOutputSchema.parse({
      image_path: imagePath,
      url: isHttpUrl(reference) ? reference : undefined,
      provider: "higgsfield",
      model: MODEL,
      cost_usd: HIGGSFIELD_IMAGE_COST_USD,
    });
  },
});

function readImageReference(stdout: string): string {
  const url = firstStringAtKeys(parseJson(stdout), ["image_path", "path", "output_path", "url", "result_url", "download_url"]);

  if (url === undefined) {
    throw new Error("Higgsfield CLI did not return an image URL or path");
  }

  return url;
}

async function readImageBytes(reference: string, projectRoot: string): Promise<Buffer> {
  if (isHttpUrl(reference)) {
    return responseBytes(await fetch(reference), "higgsfield image download");
  }

  const imagePath = isAbsolute(reference) ? reference : resolve(projectRoot, reference);
  return readFile(imagePath);
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//iu.test(value);
}

function parseJson(stdout: string): unknown {
  try {
    return JSON.parse(stdout);
  } catch {
    return undefined;
  }
}

function firstStringAtKeys(value: unknown, keys: readonly string[]): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const match = firstStringAtKeys(item, keys);
      if (match !== undefined) {
        return match;
      }
    }
    return undefined;
  }

  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }

  for (const candidate of Object.values(value)) {
    const match = firstStringAtKeys(candidate, keys);
    if (match !== undefined) {
      return match;
    }
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
