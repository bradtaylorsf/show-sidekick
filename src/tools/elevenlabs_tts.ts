import { defineTool } from "../registry/define-tool.js";
import {
  envValue,
  postTts,
  resolveVoiceFromCharacter,
  ttsProviderInputSchema,
  ttsProviderOutputSchema,
} from "../tool-support/tts-provider.js";

const COST_USD = 0.0003;
const DEFAULT_MODEL = "eleven_multilingual_v2";
const ENDPOINT = "https://api.elevenlabs.io/v1/text-to-speech";

export default defineTool({
  name: "elevenlabs_tts",
  capability: "tts",
  provider: "elevenlabs",
  status: "production",
  integration: {
    kind: "api",
    env: ["ELEVENLABS_API_KEY"],
    install: "set ELEVENLABS_API_KEY",
  },
  best_for: "Premium narration, cloned voices, and recurring character voice IDs.",
  supports: ["voice-cloning", "premium-voices", "narration-audio"],
  cost: { unit: "token", usd: COST_USD },
  agent_skills: ["elevenlabs"],
  input: ttsProviderInputSchema,
  output: ttsProviderOutputSchema,
  async execute(params, ctx) {
    const input = ttsProviderInputSchema.parse(params);
    const voiceId =
      input.voice_id ?? (input.voice_name ? await resolveVoiceFromCharacter(input.voice_name, ctx) : undefined);

    if (!voiceId) {
      throw new Error("elevenlabs_tts requires voice_id or voice_name");
    }

    const model = input.model ?? DEFAULT_MODEL;

    return postTts({
      provider: "elevenlabs",
      url: `${ENDPOINT}/${encodeURIComponent(voiceId)}`,
      headers: { "xi-api-key": envValue("ELEVENLABS_API_KEY") },
      body: {
        text: input.text,
        model_id: model,
        output_format: input.format ?? "mp3_44100_128",
      },
      costUsd: COST_USD,
      ctx,
      extension: "mp3",
      voice: voiceId,
      model,
    });
  },
});
