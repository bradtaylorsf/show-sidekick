import { defineTool } from "../registry/define-tool.js";
import { envValue, postVideoGeneration, videoProviderInputSchema, videoProviderOutputSchema } from "../tool-support/video-provider.js";

const COST_USD = 0.5;
const ENDPOINT = "https://api.replicate.com/v1/predictions";
const MODEL = "THUDM/cogvideox-5b";

export default defineTool({
  name: "cogvideo_video",
  capability: "image_to_video",
  provider: "replicate",
  status: "experimental",
  integration: { kind: "api", env: ["REPLICATE_API_TOKEN"], install: "set REPLICATE_API_TOKEN" },
  best_for: "Open-source CogVideoX image-to-video experiments through Replicate.",
  supports: ["cogvideox-5b", "replicate", "image-to-video", "text-to-video"],
  cost: { unit: "clip", usd: COST_USD },
  agent_skills: ["ai-video-gen", "cogvideo"],
  input: videoProviderInputSchema,
  output: videoProviderOutputSchema,
  async execute(params, ctx) {
    const input = videoProviderInputSchema.parse(params);

    return postVideoGeneration({
      provider: "cogvideo",
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
      prompt: input.prompt,
      model: MODEL,
    });
  },
});
