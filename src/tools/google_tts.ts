import { defineTool } from "../registry/define-tool.js";
import {
  envValue,
  ttsProviderInputSchema,
  ttsProviderOutputSchema,
  writeTtsAudioFile,
} from "../tool-support/tts-provider.js";

const COST_USD = 0.000016;
const DEFAULT_VOICE = "en-US-Chirp3-HD-Charon";
const ENDPOINT = "https://texttospeech.googleapis.com/v1/text:synthesize";

export default defineTool({
  name: "google_tts",
  capability: "tts",
  provider: "google",
  status: "production",
  integration: { kind: "api", env: ["GOOGLE_API_KEY"], install: "set GOOGLE_API_KEY" },
  best_for: "Cost-conscious narration using Google Chirp3-HD voices.",
  supports: ["chirp3-hd", "narration-audio"],
  cost: { unit: "token", usd: COST_USD },
  agent_skills: ["google-tts"],
  input: ttsProviderInputSchema,
  output: ttsProviderOutputSchema,
  async execute(params, ctx) {
    const input = ttsProviderInputSchema.parse(params);
    const voice = input.voice_id ?? DEFAULT_VOICE;
    const languageCode = input.language ?? voice.split("-").slice(0, 2).join("-");
    const response = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": envValue("GOOGLE_API_KEY"),
      },
      body: JSON.stringify({
        input: { text: input.text },
        voice: { name: voice, languageCode },
        audioConfig: { audioEncoding: "MP3" },
      }),
    });

    if (!response.ok) {
      throw new Error(`google TTS request failed (${response.status}): ${await response.text()}`);
    }

    const payload = googleTtsPayloadSchema.parse(await response.json());
    const audioPath = await writeTtsAudioFile(ctx, "google", payload.name, "mp3", Buffer.from(payload.audioContent, "base64"));

    return ttsProviderOutputSchema.parse({
      audio_path: audioPath,
      cost_usd: COST_USD,
      provider_request_id: payload.name,
      voice,
      model: input.model,
    });
  },
});

const googleTtsPayloadSchema = ttsProviderOutputSchema
  .pick({})
  .extend({
    audioContent: ttsProviderInputSchema.shape.text,
    name: ttsProviderInputSchema.shape.text.optional(),
  })
  .transform((payload) => ({
    audioContent: payload.audioContent,
    name: payload.name,
  }));
