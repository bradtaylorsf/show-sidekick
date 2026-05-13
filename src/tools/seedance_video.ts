import { defineTool } from "../registry/define-tool.js";
import { envValue, postVideoGeneration, videoProviderInputSchema, videoProviderOutputSchema } from "../tool-support/video-provider.js";

const COST_USD = 0.4;
const ENDPOINT = "https://api.bytedance.com/video/seedance/v1/image-to-video";

export default defineTool({
  name: "seedance_video",
  capability: "image_to_video",
  provider: "bytedance",
  status: "beta",
  integration: { kind: "api", env: ["BYTEDANCE_API_KEY"], install: "set BYTEDANCE_API_KEY" },
  best_for: "Direct Seedance 2.0 image-to-video generation.",
  supports: ["seedance-2.0", "image-to-video"],
  cost: { unit: "clip", usd: COST_USD },
  agent_skills: ["ai-video-gen", "seedance-2-0"],
  input: videoProviderInputSchema,
  output: videoProviderOutputSchema,
  async execute(params, ctx) {
    const input = videoProviderInputSchema.parse(params);

    return postVideoGeneration({
      provider: "bytedance",
      url: ENDPOINT,
      headers: {
        Authorization: `Bearer ${envValue("BYTEDANCE_API_KEY")}`,
      },
      body: {
        model: "seedance-2-0",
        prompt: input.prompt,
        image_url: input.image_url,
        duration: input.duration ?? 5,
        aspect_ratio: input.aspect_ratio ?? "16:9",
      },
      costUsd: COST_USD,
      ctx,
    });
  },
});
