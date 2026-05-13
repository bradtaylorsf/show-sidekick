import { defineTool } from "../registry/define-tool.js";
import {
  buildUrl,
  fetchStockVideo,
  isRecord,
  recordArrayField,
  stockVideoInputSchema,
  stockVideoOutputSchema,
  stringField,
  type StockVideoMatch,
} from "../tool-support/stock-video.js";

const ENDPOINT = "https://images-api.nasa.gov/search";

export default defineTool({
  name: "nasa",
  capability: "stock_video",
  provider: "nasa",
  status: "beta",
  integration: { kind: "api", env: [], install: "no auth required" },
  best_for: "Searching NASA Images video assets and preserving NASA public-domain attribution.",
  supports: ["stock-video", "space", "public-domain"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["stock-video", "nasa"],
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params) {
    const input = stockVideoInputSchema.parse(params);

    return fetchStockVideo({
      provider: "nasa",
      url: buildUrl(ENDPOINT, { q: input.query, media_type: "video" }),
      input,
      map: mapNasa,
    });
  },
});

function mapNasa(payload: unknown): StockVideoMatch[] {
  if (!isRecord(payload) || !isRecord(payload.collection)) {
    return [];
  }

  return recordArrayField(payload.collection, "items").flatMap((item) => {
    const data = recordArrayField(item, "data")[0] ?? {};
    const links = recordArrayField(item, "links");
    const nasaId = stringField(data, "nasa_id");
    const videoUrl = stringField(item, "href", "video_url") ?? stringField(data, "video_url");

    if (!videoUrl) {
      return [];
    }

    return [
      {
        video_url: videoUrl,
        thumbnail_url: links.map((link) => stringField(link, "href")).find((href) => href !== undefined),
        attribution: {
          source: "nasa",
          author: stringField(data, "photographer", "center"),
          source_url: nasaId ? `https://images.nasa.gov/details-${encodeURIComponent(nasaId)}` : stringField(item, "href"),
          license: "Public Domain (NASA)",
        },
      },
    ];
  });
}
