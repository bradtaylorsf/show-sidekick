import { defineTool } from "../registry/define-tool.js";
import {
  buildUrl,
  envValue,
  fetchStockVideo,
  isRecord,
  numberField,
  stockVideoInputSchema,
  stockVideoOutputSchema,
  stringField,
  type StockVideoMatch,
} from "../tool-support/stock-video.js";

const ENDPOINT = "https://pixabay.com/api/videos/";

export default defineTool({
  name: "pixabay_video",
  capability: "stock_video",
  provider: "pixabay",
  status: "beta",
  integration: { kind: "api", env: ["PIXABAY_API_KEY"], install: "set PIXABAY_API_KEY" },
  best_for: "Searching Pixabay stock video clips with creator and license attribution.",
  supports: ["stock-video", "pixabay-content-license"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["stock-video", "pixabay"],
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params) {
    const input = stockVideoInputSchema.parse(params);

    return fetchStockVideo({
      provider: "pixabay",
      url: buildUrl(ENDPOINT, { key: envValue("PIXABAY_API_KEY"), q: input.query, per_page: input.per_page }),
      input,
      map: mapPixabay,
    });
  },
});

function mapPixabay(payload: unknown): StockVideoMatch[] {
  if (!isRecord(payload) || !Array.isArray(payload.hits)) {
    return [];
  }

  return payload.hits.filter(isRecord).flatMap((hit) => {
    const variant = pickPixabayVariant(hit.videos);
    const videoUrl = variant ? stringField(variant, "url") : undefined;

    if (!variant || !videoUrl) {
      return [];
    }

    return [
      {
        video_url: videoUrl,
        thumbnail_url: stringField(variant, "thumbnail", "thumbnail_url") ?? stringField(hit, "previewURL", "largeImageURL"),
        duration: numberField(hit, "duration"),
        width: numberField(variant, "width"),
        height: numberField(variant, "height"),
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

function pickPixabayVariant(value: unknown): Record<string, unknown> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }

  for (const key of ["large", "medium", "small", "tiny"]) {
    const variant = value[key];

    if (isRecord(variant) && stringField(variant, "url")) {
      return variant;
    }
  }

  return undefined;
}
