import { z } from "zod";
import { decodeBase64Image, definedEntries, responseBytes, responseJson, writeGeneratedImage } from "../media/generated-image.js";
import { defineTool } from "../registry/index.js";

const FLUX_COST_USD = 0.04;
const DEFAULT_MODEL = "flux-pro-1.1";

export const FluxImageInputSchema = z.object({
  prompt: z.string().min(1),
  aspect_ratio: z.string().default("1:1"),
  seed: z.number().int().nonnegative().optional(),
  model: z.enum(["flux-pro-1.1", "flux-dev"]).default(DEFAULT_MODEL),
  max_poll_attempts: z.number().int().positive().default(30),
  poll_interval_ms: z.number().int().nonnegative().default(1_000),
});

export const FluxImageOutputSchema = z.object({
  image_path: z.string(),
  url: z.string().url().optional(),
  provider: z.literal("bfl"),
  model: z.string(),
  cost_usd: z.number().nonnegative(),
  seed: z.number().int().nonnegative().optional(),
});

type FluxCreateResponse = {
  id?: string;
  polling_url?: string;
};

type FluxPollResponse = {
  status?: string;
  result?: {
    sample?: string;
  };
  error?: string;
};

export default defineTool({
  name: "flux_image",
  capability: "image_generation",
  provider: "bfl",
  status: "beta",
  integration: {
    kind: "api",
    env: ["BFL_API_KEY"],
    install: "Set BFL_API_KEY to a Black Forest Labs API key.",
  },
  best_for: "high-quality FLUX prompt-to-image generation with API cost tracking",
  supports: ["flux-pro-1.1", "flux-dev", "text-to-image"],
  cost: { unit: "image", usd: FLUX_COST_USD },
  agent_skills: ["flux-best-practices", "bfl-api"],
  input: FluxImageInputSchema,
  output: FluxImageOutputSchema,

  async execute(params, ctx) {
    const input = FluxImageInputSchema.parse(params);
    const apiKey = requiredEnv("BFL_API_KEY");
    const createResponse = await responseJson<FluxCreateResponse>(
      await fetch(`https://api.bfl.ai/v1/${input.model}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-key": apiKey,
        },
        body: JSON.stringify(
          definedEntries({
            prompt: input.prompt,
            aspect_ratio: input.aspect_ratio,
            seed: input.seed,
          }),
        ),
      }),
      "flux image request",
    );

    const requestId = createResponse.id;
    if (!requestId && !createResponse.polling_url) {
      throw new Error("flux image request did not return a request id");
    }

    const result = await pollFlux({
      apiKey,
      pollingUrl: createResponse.polling_url ?? `https://api.bfl.ai/v1/get_result?id=${encodeURIComponent(requestId ?? "")}`,
      maxAttempts: input.max_poll_attempts,
      intervalMs: input.poll_interval_ms,
    });
    const sample = result.result?.sample;
    if (!sample) {
      throw new Error("flux image result did not include result.sample");
    }

    const bytes = sample.startsWith("data:")
      ? decodeBase64Image(sample)
      : await responseBytes(await fetch(sample), "flux image download");
    const imagePath = await writeGeneratedImage(ctx, bytes);

    return FluxImageOutputSchema.parse({
      image_path: imagePath,
      url: sample.startsWith("http") ? sample : undefined,
      provider: "bfl",
      model: input.model,
      cost_usd: FLUX_COST_USD,
      seed: input.seed,
    });
  },
});

async function pollFlux(options: {
  apiKey: string;
  pollingUrl: string;
  maxAttempts: number;
  intervalMs: number;
}): Promise<FluxPollResponse> {
  for (let attempt = 1; attempt <= options.maxAttempts; attempt += 1) {
    const response = await responseJson<FluxPollResponse>(
      await fetch(options.pollingUrl, {
        method: "GET",
        headers: { "x-key": options.apiKey },
      }),
      "flux image poll",
    );
    const status = response.status?.toLowerCase();

    if (status === "ready") {
      return response;
    }

    if (status === "error" || status === "failed") {
      throw new Error(`flux image generation failed: ${response.error ?? response.status}`);
    }

    if (attempt < options.maxAttempts && options.intervalMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, options.intervalMs));
    }
  }

  throw new Error("flux image generation timed out");
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`missing env: ${name}`);
  }

  return value;
}
