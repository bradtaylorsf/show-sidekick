import { defineTool } from "../registry/define-tool.js";
import { envValue, postVideoGeneration, videoProviderInputSchema, videoProviderOutputSchema } from "../tool-support/video-provider.js";

const COST_USD = 0.5;
const ENDPOINT = "https://api.replicate.com/v1/predictions";
const MODEL = "wan-ai/wan-2.1";

export default defineTool({
  name: "wan_video",
  capability: "image_to_video",
  provider: "replicate",
  status: "experimental",
  integration: { kind: "api", env: ["REPLICATE_API_TOKEN"], install: "set REPLICATE_API_TOKEN" },
  best_for: "Open-source Wan 2.1 image-to-video experiments through Replicate.",
  supports: ["wan-2.1", "replicate", "image-to-video", "text-to-video"],
  cost: { unit: "clip", usd: COST_USD },
  agent_skills: ["ai-video-gen", "wan"],
  input: videoProviderInputSchema,
  output: videoProviderOutputSchema,
  async execute(params, ctx) {
    const input = videoProviderInputSchema.parse(params);

    return postVideoGeneration({
      provider: "wan",
      url: ENDPOINT,
      headers: {
        Authorization: `Bearer ${envValue("REPLICATE_API_TOKEN")}`,
        Prefer: "wait",
      },
      body: {
        model: MODEL,
        input: {
          prompt: input.prompt,
          image: input.image_url,
          duration: input.duration ?? 5,
          aspect_ratio: input.aspect_ratio ?? "16:9",
        },
      },
      costUsd: COST_USD,
      ctx,
    });
  },
});
