import { z } from "zod";
import { decodeBase64Image, definedEntries, responseBytes, responseJson, writeGeneratedImage } from "../media/generated-image.js";
import { defineTool } from "../registry/index.js";

const RECRAFT_IMAGE_COST_USD = 0.04;
const MODEL = "recraftv3";

export const RecraftImageInputSchema = z.object({
  prompt: z.string().min(1),
  size: z.string().default("1024x1024"),
  style: z.string().optional(),
});

export const RecraftImageOutputSchema = z.object({
  image_path: z.string(),
  url: z.string().url().optional(),
  provider: z.literal("recraft"),
  model: z.literal(MODEL),
  cost_usd: z.number().nonnegative(),
});

type RecraftImageResponse = {
  data?: Array<{
    b64_json?: string;
    url?: string;
  }>;
};
type RecraftImage = NonNullable<RecraftImageResponse["data"]>[number];

export default defineTool({
  name: "recraft_image",
  capability: "image_generation",
  provider: "recraft",
  status: "beta",
  integration: {
    kind: "api",
    env: ["RECRAFT_API_KEY"],
    install: "Set RECRAFT_API_KEY to a Recraft API key.",
  },
  best_for: "Recraft v3 prompt-to-image generation for design-forward still assets",
  supports: ["recraftv3", "text-to-image"],
  cost: { unit: "image", usd: RECRAFT_IMAGE_COST_USD },
  input: RecraftImageInputSchema,
  output: RecraftImageOutputSchema,

  async execute(params, ctx) {
    const input = RecraftImageInputSchema.parse(params);
    const response = await responseJson<RecraftImageResponse>(
      await fetch("https://external.api.recraft.ai/v1/images/generations", {
        method: "POST",
        headers: {
          authorization: `Bearer ${requiredEnv("RECRAFT_API_KEY")}`,
          "content-type": "application/json",
        },
        body: JSON.stringify(
          definedEntries({
            prompt: input.prompt,
            model: MODEL,
            size: input.size,
            style: input.style,
          }),
        ),
      }),
      "recraft image request",
    );
    const image = response.data?.[0];
    const bytes = await readImageBytes(image, "recraft");
    const imagePath = await writeGeneratedImage(ctx, bytes);

    return RecraftImageOutputSchema.parse({
      image_path: imagePath,
      url: image?.url,
      provider: "recraft",
      model: MODEL,
      cost_usd: RECRAFT_IMAGE_COST_USD,
    });
  },
});

async function readImageBytes(image: RecraftImage | undefined, label: string): Promise<Buffer> {
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
