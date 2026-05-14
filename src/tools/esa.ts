import { defineTool } from "../registry/define-tool.js";
import {
  buildUrl,
  fetchStockVideo,
  isRecord,
  numberField,
  recordArrayField,
  stockVideoInputSchema,
  stockVideoOutputSchema,
  stringField,
  type StockVideoMatch,
} from "../tool-support/stock-video.js";

const ENDPOINT = "https://www.esa.int/services/api/search";

export default defineTool({
  name: "esa",
  capability: "stock_video",
  provider: "esa",
  status: "beta",
  integration: { kind: "api", env: [], install: "no auth required" },
  best_for: "Searching ESA video assets for space and science explainers.",
  supports: ["stock-video", "space", "science", "esa-standard-license"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["stock-video", "esa"],
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    const input = stockVideoInputSchema.parse(params);

    return fetchStockVideo({
      provider: "esa",
      url: buildUrl(ENDPOINT, { q: input.query, type: "video", limit: input.per_page }),
      input,
      ctx,
      map: mapEsa,
    });
  },
});

function mapEsa(payload: unknown): StockVideoMatch[] {
  const items = Array.isArray(payload)
    ? payload.filter(isRecord)
    : isRecord(payload)
      ? [...recordArrayField(payload, "results"), ...recordArrayField(payload, "items")]
      : [];

  return items.flatMap((item) => {
    const videoUrl = stringField(item, "video_url", "download_url", "file_url", "url");

    if (!videoUrl) {
      return [];
    }

    return [
      {
        video_url: videoUrl,
        thumbnail_url: stringField(item, "thumbnail_url", "thumbnail", "image_url"),
        duration: numberField(item, "duration", "duration_seconds"),
        width: numberField(item, "width"),
        height: numberField(item, "height"),
        attribution: {
          source: "esa",
          author: stringField(item, "author", "creator", "credit") ?? "ESA",
          source_url: stringField(item, "source_url", "page_url", "url"),
          license: stringField(item, "license") ?? "ESA Standard License",
        },
      },
    ];
  });
}
