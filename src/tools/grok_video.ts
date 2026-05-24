import { defineTool } from "../registry/define-tool.js";
import { envValue, postVideoGeneration, videoProviderInputSchema, videoProviderOutputSchema } from "../tool-support/video-provider.js";

const COST_USD = 0.5;
const ENDPOINT = "https://api.x.ai/v1/video/generations";
const DEFAULT_MODEL = "grok-video-1";

export default defineTool({
  name: "grok_video",
  capability: "text_to_video",
  provider: "xai",
  status: "experimental",
  integration: { kind: "api", env: ["XAI_API_KEY"], install: "set XAI_API_KEY" },
  best_for: "Grok text-to-video generations through the xAI API.",
  supports: ["grok-video-1", "text-to-video", "image-prompt"],
  cost: { unit: "clip", usd: COST_USD },
  agent_skills: ["ai-video-gen", "grok-media"],
  input: videoProviderInputSchema,
  output: videoProviderOutputSchema,
  async execute(params, ctx) {
    const input = videoProviderInputSchema.parse(params);

    return postVideoGeneration({
      provider: "grok",
      url: ENDPOINT,
      headers: {
        Authorization: `Bearer ${envValue("XAI_API_KEY")}`,
      },
      body: {
        model: input.model ?? DEFAULT_MODEL,
        prompt: input.prompt,
        image_url: input.image_url,
        duration: input.duration ?? 5,
        aspect_ratio: input.aspect_ratio ?? "16:9",
      },
      costUsd: COST_USD,
      ctx,
      prompt: input.prompt,
      model: input.model ?? DEFAULT_MODEL,
    });
  },
});
