import { z } from "zod";
import { decodeBase64Image, definedEntries, responseBytes, responseJson, writeGeneratedImage } from "../media/generated-image.js";
import { defineTool } from "../registry/index.js";

const GROK_IMAGE_COST_USD = 0.07;
const DEFAULT_MODEL = "grok-2-image";

export const GrokImageInputSchema = z.object({
  prompt: z.string().min(1),
  aspect_ratio: z.string().optional(),
  model: z.string().default(DEFAULT_MODEL),
});

export const GrokImageOutputSchema = z.object({
  image_path: z.string(),
  url: z.string().url().optional(),
  provider: z.literal("xai"),
  model: z.string(),
  cost_usd: z.number().nonnegative(),
});

type GrokImageResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
};
type GrokImage = NonNullable<GrokImageResponse["data"]>[number];

export default defineTool({
  name: "grok_image",
  capability: "image_generation",
  provider: "xai",
  status: "beta",
  integration: {
    kind: "api",
    env: ["XAI_API_KEY"],
    install: "Set XAI_API_KEY to an xAI API key.",
  },
  best_for: "Grok image generations through xAI's OpenAI-compatible image endpoint",
  supports: ["grok-2-image", "text-to-image"],
  cost: { unit: "image", usd: GROK_IMAGE_COST_USD },
  agent_skills: ["grok-image"],
  input: GrokImageInputSchema,
  output: GrokImageOutputSchema,

  async execute(params, ctx) {
    const input = GrokImageInputSchema.parse(params);
    const response = await responseJson<GrokImageResponse>(
      await fetch("https://api.x.ai/v1/images/generations", {
        method: "POST",
        headers: {
          authorization: `Bearer ${requiredEnv("XAI_API_KEY")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(
          definedEntries({
            model: input.model,
            prompt: input.prompt,
            n: 1,
            response_format: "b64_json",
            aspect_ratio: input.aspect_ratio,
          }),
        ),
      }),
      "grok image request",
    );
    const image = response.data?.[0];
    const bytes = await readImageBytes(image, "grok");
    const imagePath = await writeGeneratedImage(ctx, bytes);

    return GrokImageOutputSchema.parse({
      image_path: imagePath,
      url: image?.url,
      provider: "xai",
      model: input.model,
      cost_usd: GROK_IMAGE_COST_USD,
    });
  },
});

async function readImageBytes(image: GrokImage | undefined, label: string): Promise<Buffer> {
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
