import { defineTool } from "../registry/define-tool.js";
import {
  buildUrl,
  envValue,
  fetchMusic,
  isRecord,
  musicQueryInputSchema,
  musicProviderOutputSchema,
  numberField,
  stringField,
  type MusicMatch,
} from "../tool-support/music-provider.js";

const ENDPOINT = "https://freesound.org/apiv2/search/text/";

export default defineTool({
  name: "freesound_music",
  capability: "music_search",
  provider: "freesound",
  status: "beta",
  integration: { kind: "api", env: ["FREESOUND_API_KEY"], install: "set FREESOUND_API_KEY (token-based, free)" },
  best_for: "Searching Freesound music and loop previews with explicit license attribution.",
  supports: ["royalty-free", "music-search", "freesound"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["music", "freesound"],
  input: musicQueryInputSchema,
  output: musicProviderOutputSchema,
  async execute(params) {
    const input = musicQueryInputSchema.parse(params);

    return fetchMusic({
      provider: "freesound",
      url: buildUrl(ENDPOINT, {
        query: input.query,
        token: envValue("FREESOUND_API_KEY"),
        fields: "id,name,duration,previews,license,username,url",
        filter: "type:wav OR type:mp3",
        page_size: input.per_page,
      }),
      input,
      map: mapFreesound,
    });
  },
});

function mapFreesound(payload: unknown): MusicMatch[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return [];
  }

  return payload.results.filter(isRecord).flatMap((result) => {
    const previews = isRecord(result.previews) ? result.previews : {};
    const audioUrl =
      stringField(previews, "preview-hq-mp3", "preview-lq-mp3", "preview-hq-ogg", "preview-lq-ogg") ??
      stringField(result, "audio_url");

    if (!audioUrl) {
      return [];
    }

    return [
      {
        audio_url: audioUrl,
        preview_url: audioUrl,
        duration: numberField(result, "duration"),
        attribution: {
          source: "freesound",
          author: stringField(result, "username"),
          source_url: stringField(result, "url") ?? freesoundUrl(result),
          license: stringField(result, "license") ?? "Freesound license",
        },
      },
    ];
  });
}

function freesoundUrl(result: Record<string, unknown>): string | undefined {
  const id = numberField(result, "id");
  return id === undefined ? undefined : `https://freesound.org/s/${id}/`;
}
