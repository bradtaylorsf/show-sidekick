import { defineTool } from "../registry/define-tool.js";
import { envValue, postVideoGeneration, videoProviderInputSchema, videoProviderOutputSchema } from "../tool-support/video-provider.js";

const COST_USD = 0.05;
const ENDPOINT = "https://api.runwayml.com/v1/image_to_video";

export default defineTool({
  name: "runway_video",
  capability: "image_to_video",
  provider: "runway",
  status: "beta",
  integration: { kind: "api", env: ["RUNWAY_API_KEY"], install: "set RUNWAY_API_KEY" },
  best_for: "Runway Gen-3 image-to-video clips with strong camera motion.",
  supports: ["gen-3", "image-to-video"],
  cost: { unit: "second", usd: COST_USD },
  agent_skills: ["ai-video-gen", "runway"],
  input: videoProviderInputSchema,
  output: videoProviderOutputSchema,
  async execute(params, ctx) {
    const input = videoProviderInputSchema.parse(params);

    return postVideoGeneration({
      provider: "runway",
      url: ENDPOINT,
      headers: {
        Authorization: `Bearer ${envValue("RUNWAY_API_KEY")}`,
        "X-Runway-Version": "2024-11-06",
      },
      body: {
        model: "gen3a_turbo",
        promptText: input.prompt,
        promptImage: input.image_url,
        duration: input.duration ?? 5,
        ratio: input.aspect_ratio ?? "16:9",
      },
      costUsd: COST_USD,
      ctx,
    });
  },
});
