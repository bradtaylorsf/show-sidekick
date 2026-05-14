import { defineTool } from "../registry/define-tool.js";
import { envValue, postVideoGeneration, videoProviderInputSchema, videoProviderOutputSchema } from "../tool-support/video-provider.js";

const COST_USD = 0.3;
const ENDPOINT = "https://api.klingai.com/kling-video/v2.1/pro/image-to-video";
const MODEL = "kling-v2.1-pro";

export default defineTool({
  name: "kling_video",
  capability: "image_to_video",
  provider: "kling",
  status: "production",
  integration: {
    kind: "api",
    env: ["KLING_ACCESS_KEY", "KLING_SECRET_KEY"],
    install: "set KLING_ACCESS_KEY and KLING_SECRET_KEY",
  },
  best_for: "Premium Kling v2.1 Pro direct API image-to-video clips.",
  supports: ["kling-v2.1-pro", "image-to-video", "text-to-video"],
  cost: { unit: "clip", usd: COST_USD },
  agent_skills: ["ai-video-gen", "kling"],
  input: videoProviderInputSchema,
  output: videoProviderOutputSchema,
  async execute(params, ctx) {
    const input = videoProviderInputSchema.parse(params);

    return postVideoGeneration({
      provider: "kling",
      url: ENDPOINT,
      headers: {
        Authorization: `Key ${envValue("KLING_ACCESS_KEY")}:${envValue("KLING_SECRET_KEY")}`,
      },
      body: {
        image_url: input.image_url,
        prompt: input.prompt,
        duration: input.duration ?? 5,
        aspect_ratio: input.aspect_ratio ?? "16:9",
      },
      costUsd: COST_USD,
      ctx,
      prompt: input.prompt,
      model: MODEL,
    });
  },
});
