import { z } from "zod";
import { decodeBase64Image, responseBytes, responseJson, writeGeneratedImage } from "../media/generated-image.js";
import { defineTool } from "../registry/index.js";

const OPENAI_IMAGE_COST_USD = 0.04;
const MODEL = "gpt-image-1";

export const OpenAiImageInputSchema = z.object({
  prompt: z.string().min(1),
  size: z.string().default("1024x1024"),
  quality: z.enum(["auto", "low", "medium", "high"]).default("auto"),
});

export const OpenAiImageOutputSchema = z.object({
  image_path: z.string(),
  url: z.string().url().optional(),
  provider: z.literal("openai"),
  model: z.literal(MODEL),
  cost_usd: z.number().nonnegative(),
});

type OpenAiImageResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
};
type OpenAiImage = NonNullable<OpenAiImageResponse["data"]>[number];

export default defineTool({
  name: "openai_image",
  capability: "image_generation",
  provider: "openai",
  status: "beta",
  integration: {
    kind: "api",
    env: ["OPENAI_API_KEY"],
    install: "Set OPENAI_API_KEY to an OpenAI API key.",
  },
  best_for: 'gpt-image-1 generations, especially images that require legible text',
  supports: ["gpt-image-1", "text-to-image", "legible-text"],
  cost: { unit: "image", usd: OPENAI_IMAGE_COST_USD },
  input: OpenAiImageInputSchema,
  output: OpenAiImageOutputSchema,

  async execute(params, ctx) {
    const input = OpenAiImageInputSchema.parse(params);
    const response = await responseJson<OpenAiImageResponse>(
      await fetch("https://api.openai.com/v1/images/generations", {
        method: "POST",
        headers: {
          authorization: `Bearer ${requiredEnv("OPENAI_API_KEY")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: MODEL,
          prompt: input.prompt,
          size: input.size,
          quality: input.quality,
          n: 1,
        }),
      }),
      "openai image request",
    );
    const image = response.data?.[0];
    const bytes = await readImageBytes(image, "openai");
    const imagePath = await writeGeneratedImage(ctx, bytes);

    return OpenAiImageOutputSchema.parse({
      image_path: imagePath,
      url: image?.url,
      provider: "openai",
      model: MODEL,
      cost_usd: OPENAI_IMAGE_COST_USD,
    });
  },
});

async function readImageBytes(image: OpenAiImage | undefined, label: string): Promise<Buffer> {
  if (image?.b64_json) {
    return decodeBase64Image(image.b64_json);
  }

  if (image?.url) {
    return responseBytes(await fetch(image.url), `${label} image download`);
  }

  throw new Error(`${label} image response did not include b64_json or url`);
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`missing env: ${name}`);
  }

  return value;
}
