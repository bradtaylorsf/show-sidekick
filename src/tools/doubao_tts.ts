import { defineTool } from "../registry/define-tool.js";
import { envValue, postTts, ttsProviderInputSchema, ttsProviderOutputSchema } from "../tool-support/tts-provider.js";

const COST_USD = 0.00002;
const DEFAULT_VOICE = "zh_female_wanwanxiaohe_moon_bigtts";
const ENDPOINT = "https://openspeech.bytedance.com/api/v1/tts";

export default defineTool({
  name: "doubao_tts",
  capability: "tts",
  provider: "doubao",
  status: "beta",
  integration: {
    kind: "api",
    env: ["DOUBAO_API_KEY", "DOUBAO_APP_ID"],
    install: "set DOUBAO_API_KEY and DOUBAO_APP_ID",
  },
  best_for: "Doubao/ByteDance narration voices when the project is already using ByteDance audio APIs.",
  supports: ["narration-audio", "bytedance-tts"],
  cost: { unit: "token", usd: COST_USD },
  agent_skills: ["doubao-tts"],
  input: ttsProviderInputSchema,
  output: ttsProviderOutputSchema,
  async execute(params, ctx) {
    const input = ttsProviderInputSchema.parse(params);
    const voice = input.voice_id ?? DEFAULT_VOICE;
    const requestId = `show-sidekick-${Date.now().toString()}`;

    return postTts({
      provider: "doubao",
      url: ENDPOINT,
      headers: {
        Authorization: `Bearer ${envValue("DOUBAO_API_KEY")}`,
        "X-Api-App-Id": envValue("DOUBAO_APP_ID"),
      },
      body: {
        app: {
          appid: envValue("DOUBAO_APP_ID"),
          token: envValue("DOUBAO_API_KEY"),
          cluster: "volcano_tts",
        },
        user: { uid: "show-sidekick" },
        audio: {
          voice_type: voice,
          encoding: input.format ?? "mp3",
          speed_ratio: 1,
        },
        request: {
          reqid: requestId,
          text: input.text,
          operation: "query",
        },
      },
      costUsd: COST_USD,
      ctx,
      extension: input.format ?? "mp3",
      voice,
      model: input.model,
    });
  },
});
