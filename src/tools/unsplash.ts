import { defineTool } from "../registry/define-tool.js";
import {
  buildUrl,
  envValue,
  fetchStockImage,
  isRecord,
  numberField,
  recordField,
  stockImageOutputSchema,
  stockVideoInputSchema,
  stringField,
  type StockImageMatch,
} from "../tool-support/stock-video.js";

const ENDPOINT = "https://api.unsplash.com/search/photos";

export default defineTool({
  name: "unsplash",
  capability: "stock_image",
  provider: "unsplash",
  status: "beta",
  integration: { kind: "api", env: ["UNSPLASH_ACCESS_KEY"], install: "set UNSPLASH_ACCESS_KEY" },
  best_for: "Searching Unsplash image assets for documentary and explainer visual coverage.",
  supports: ["stock-image", "unsplash-license"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["stock-image", "unsplash"],
  input: stockVideoInputSchema,
  output: stockImageOutputSchema,
  async execute(params) {
    const input = stockVideoInputSchema.parse(params);

    return fetchStockImage({
      provider: "unsplash",
      url: buildUrl(ENDPOINT, { query: input.query, per_page: input.per_page }),
      headers: { Authorization: `Client-ID ${envValue("UNSPLASH_ACCESS_KEY")}` },
      input,
      map: mapUnsplash,
    });
  },
});

function mapUnsplash(payload: unknown): StockImageMatch[] {
  if (!isRecord(payload) || !Array.isArray(payload.results)) {
    return [];
  }

  return payload.results.filter(isRecord).flatMap((photo) => {
    const urls = recordField(photo, "urls") ?? {};
    const links = recordField(photo, "links") ?? {};
    const user = recordField(photo, "user") ?? {};
    const imageUrl = stringField(urls, "raw", "full", "regular");

    if (!imageUrl) {
      return [];
    }

    return [
      {
        image_url: imageUrl,
        thumbnail_url: stringField(urls, "thumb", "small"),
        width: numberField(photo, "width"),
        height: numberField(photo, "height"),
        attribution: {
          source: "unsplash",
          author: stringField(user, "name", "username"),
          source_url: stringField(links, "html"),
          license: "Unsplash License",
        },
      },
    ];
  });
}
