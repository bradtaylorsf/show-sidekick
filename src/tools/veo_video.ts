import { defineTool } from "../registry/define-tool.js";
import { envValue, postVideoGeneration, videoProviderInputSchema, videoProviderOutputSchema } from "../tool-support/video-provider.js";

const COST_USD = 0.5;
const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predict";
const inputSchema = videoProviderInputSchema.omit({ image_url: true }).strict();

export default defineTool({
  name: "veo_video",
  capability: "text_to_video",
  provider: "google",
  status: "beta",
  integration: { kind: "api", env: ["GOOGLE_API_KEY"], install: "set GOOGLE_API_KEY" },
  best_for: "Google Veo text-to-video clips for premium cinematic motion.",
  supports: ["veo", "text-to-video"],
  cost: { unit: "second", usd: COST_USD },
  agent_skills: ["ai-video-gen", "veo"],
  input: inputSchema,
  output: videoProviderOutputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);

    return postVideoGeneration({
      provider: "google",
      url: ENDPOINT,
      headers: {
        "x-goog-api-key": envValue("GOOGLE_API_KEY"),
      },
      body: {
        instances: [{ prompt: input.prompt }],
        parameters: {
          durationSeconds: input.duration ?? 5,
          aspectRatio: input.aspect_ratio ?? "16:9",
        },
      },
      costUsd: COST_USD,
      ctx,
    });
  },
});
