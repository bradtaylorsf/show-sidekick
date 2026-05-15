import { defineTool } from "../registry/define-tool.js";
import {
  buildUrl,
  envValue,
  fetchMusic,
  isRecord,
  musicProviderOutputSchema,
  musicQueryInputSchema,
  numberField,
  stringField,
  type MusicMatch,
} from "../tool-support/music-provider.js";

const ENDPOINT = "https://pixabay.com/api/audio/";

export default defineTool({
  name: "pixabay_music",
  capability: "music_search",
  provider: "pixabay",
  status: "beta",
  integration: { kind: "api", env: ["PIXABAY_API_KEY"], install: "set PIXABAY_API_KEY" },
  best_for: "Searching Pixabay royalty-free music beds with Pixabay Content License attribution.",
  supports: ["royalty-free", "music-search", "pixabay-content-license"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["music"],
  input: musicQueryInputSchema,
  output: musicProviderOutputSchema,
  async execute(params) {
    const input = musicQueryInputSchema.parse(params);

    return fetchMusic({
      provider: "pixabay",
      url: buildUrl(ENDPOINT, {
        key: envValue("PIXABAY_API_KEY"),
        q: input.query,
        per_page: input.per_page,
      }),
      input,
      map: mapPixabayMusic,
    });
  },
});

function mapPixabayMusic(payload: unknown): MusicMatch[] {
  if (!isRecord(payload) || !Array.isArray(payload.hits)) {
    return [];
  }

  return payload.hits.filter(isRecord).flatMap((hit) => {
    const audioUrl = stringField(hit, "audio", "audioURL", "downloadURL");

    if (!audioUrl) {
      return [];
    }

    return [
      {
        audio_url: audioUrl,
        preview_url: stringField(hit, "preview", "previewURL"),
        duration: numberField(hit, "duration"),
        bpm: numberField(hit, "bpm"),
        attribution: {
          source: "pixabay",
          author: stringField(hit, "user"),
          source_url: stringField(hit, "pageURL"),
          license: "Pixabay Content License",
        },
      },
    ];
  });
}
