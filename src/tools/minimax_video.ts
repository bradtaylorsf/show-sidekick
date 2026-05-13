import { defineTool } from "../registry/define-tool.js";
import { envValue, postVideoGeneration, videoProviderInputSchema, videoProviderOutputSchema } from "../tool-support/video-provider.js";

const COST_USD = 0.5;
const ENDPOINT = "https://api.minimax.io/v1/video_generation";

export default defineTool({
  name: "minimax_video",
  capability: "image_to_video",
  provider: "minimax",
  status: "beta",
  integration: { kind: "api", env: ["MINIMAX_API_KEY"], install: "set MINIMAX_API_KEY" },
  best_for: "MiniMax video-01 image-to-video clips.",
  supports: ["video-01", "image-to-video"],
  cost: { unit: "clip", usd: COST_USD },
  agent_skills: ["ai-video-gen", "minimax"],
  input: videoProviderInputSchema,
  output: videoProviderOutputSchema,
  async execute(params, ctx) {
    const input = videoProviderInputSchema.parse(params);

    return postVideoGeneration({
      provider: "minimax",
      url: ENDPOINT,
      headers: {
        Authorization: `Bearer ${envValue("MINIMAX_API_KEY")}`,
      },
      body: {
        model: "video-01",
        prompt: input.prompt,
        first_frame_image: input.image_url,
        duration: input.duration ?? 5,
        aspect_ratio: input.aspect_ratio ?? "16:9",
      },
      costUsd: COST_USD,
      ctx,
    });
  },
});
