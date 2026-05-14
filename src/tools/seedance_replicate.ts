import { defineTool } from "../registry/define-tool.js";
import { envValue, postVideoGeneration, videoProviderInputSchema, videoProviderOutputSchema } from "../tool-support/video-provider.js";

const COST_USD = 0.05;
const ENDPOINT = "https://api.replicate.com/v1/predictions";

export default defineTool({
  name: "seedance_replicate",
  capability: "image_to_video",
  provider: "replicate",
  status: "beta",
  integration: { kind: "api", env: ["REPLICATE_API_TOKEN"], install: "set REPLICATE_API_TOKEN" },
  best_for: "Seedance 2.0 through Replicate when direct ByteDance access is unavailable.",
  supports: ["seedance-2.0", "replicate", "image-to-video"],
  cost: { unit: "second", usd: COST_USD },
  agent_skills: ["ai-video-gen", "seedance-2-0"],
  input: videoProviderInputSchema,
  output: videoProviderOutputSchema,
  async execute(params, ctx) {
    const input = videoProviderInputSchema.parse(params);

    return postVideoGeneration({
      provider: "replicate",
      url: ENDPOINT,
      headers: {
        Authorization: `Bearer ${envValue("REPLICATE_API_TOKEN")}`,
        Prefer: "wait",
      },
      body: {
        model: "bytedance/seedance-2-0",
        input: {
          prompt: input.prompt,
          image: input.image_url,
          duration: input.duration ?? 5,
          aspect_ratio: input.aspect_ratio ?? "16:9",
        },
      },
      costUsd: (input.duration ?? 5) * COST_USD,
      ctx,
      prompt: input.prompt,
      model: "bytedance/seedance-2-0",
    });
  },
});
