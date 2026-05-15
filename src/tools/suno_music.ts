import { defineTool } from "../registry/define-tool.js";
import { envValue, musicGenInputSchema, musicGenOutputSchema, postMusicGeneration } from "../tool-support/music-provider.js";

const COST_USD = 0.05;
const DEFAULT_MODEL = "suno-v3.5";
const ENDPOINT = "https://api.suno.ai/v1/generate";

/**
 * If SUNO_API_KEY is unavailable, the documented fallback is to drop tracks into `music_library/` and select them via the music-plan skill.
 */
export default defineTool({
  name: "suno_music",
  capability: "music_generation",
  provider: "suno",
  status: "beta",
  integration: {
    kind: "api",
    env: ["SUNO_API_KEY"],
    install: "set SUNO_API_KEY (or supply tracks via music_library/)",
  },
  best_for: "Generated music beds; when unavailable, use user-supplied tracks from music_library/ through the music-plan skill.",
  supports: ["generated-music", "music-bed"],
  cost: { unit: "call", usd: COST_USD },
  agent_skills: ["music"],
  input: musicGenInputSchema,
  output: musicGenOutputSchema,
  async execute(params, ctx) {
    const input = musicGenInputSchema.parse(params);

    return postMusicGeneration({
      provider: "suno",
      url: ENDPOINT,
      headers: { Authorization: `Bearer ${envValue("SUNO_API_KEY")}` },
      body: {
        prompt: input.prompt,
        duration: input.duration ?? 30,
        model: DEFAULT_MODEL,
      },
      costUsd: COST_USD,
      ctx,
      extension: "mp3",
    });
  },
});
