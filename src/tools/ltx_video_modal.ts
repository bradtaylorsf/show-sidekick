import { defineTool } from "../registry/define-tool.js";
import { envValue, postVideoGeneration, videoProviderInputSchema, videoProviderOutputSchema } from "../tool-support/video-provider.js";

const COST_USD = 0.15;

export default defineTool({
  name: "ltx_video_modal",
  capability: "image_to_video",
  provider: "modal",
  status: "experimental",
  integration: {
    kind: "api",
    env: ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET", "MODAL_LTX_URL"],
    install: "set MODAL_TOKEN_ID, MODAL_TOKEN_SECRET, and MODAL_LTX_URL",
  },
  best_for: "Modal-hosted LTX image-to-video when local GPU capacity is unavailable.",
  supports: ["ltx-video", "modal", "image-to-video", "text-to-video"],
  cost: { unit: "clip", usd: COST_USD },
  agent_skills: ["ai-video-gen", "ltx"],
  input: videoProviderInputSchema,
  output: videoProviderOutputSchema,
  async execute(params, ctx) {
    const input = videoProviderInputSchema.parse(params);

    return postVideoGeneration({
      provider: "ltx_modal",
      url: envValue("MODAL_LTX_URL"),
      headers: {
        "Modal-Key": envValue("MODAL_TOKEN_ID"),
        "Modal-Secret": envValue("MODAL_TOKEN_SECRET"),
      },
      body: {
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
