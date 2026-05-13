import { defineTool } from "../registry/define-tool.js";
import { envValue, postTts, ttsProviderInputSchema, ttsProviderOutputSchema } from "../tool-support/tts-provider.js";

const COST_USD = 0.000015;
const DEFAULT_MODEL = "gpt-4o-mini-tts";
const DEFAULT_VOICE = "alloy";
const ENDPOINT = "https://api.openai.com/v1/audio/speech";

export default defineTool({
  name: "openai_tts",
  capability: "tts",
  provider: "openai",
  status: "production",
  integration: { kind: "api", env: ["OPENAI_API_KEY"], install: "set OPENAI_API_KEY" },
  best_for: "Fast general-purpose narration with OpenAI gpt-4o-mini-tts voices.",
  supports: ["narration-audio", "gpt-4o-mini-tts"],
  cost: { unit: "token", usd: COST_USD },
  agent_skills: ["openai-tts"],
  input: ttsProviderInputSchema,
  output: ttsProviderOutputSchema,
  async execute(params, ctx) {
    const input = ttsProviderInputSchema.parse(params);
    const model = input.model ?? DEFAULT_MODEL;
    const voice = input.voice_id ?? DEFAULT_VOICE;

    return postTts({
      provider: "openai",
      url: ENDPOINT,
      headers: { Authorization: `Bearer ${envValue("OPENAI_API_KEY")}` },
      body: {
        model,
        voice,
        input: input.text,
        format: input.format ?? "mp3",
      },
      costUsd: COST_USD,
      ctx,
      extension: input.format ?? "mp3",
      voice,
      model,
    });
  },
});
