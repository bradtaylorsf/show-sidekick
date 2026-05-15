import { defineTool } from "../registry/define-tool.js";
import {
  buildUrl,
  fetchStockVideo,
  isRecord,
  numberField,
  recordArrayField,
  stockVideoInputSchema,
  stockVideoOutputSchema,
  stringArrayField,
  stringField,
  type StockVideoMatch,
} from "../tool-support/stock-video.js";

const ENDPOINT = "https://www.loc.gov/search/";

export default defineTool({
  name: "loc",
  capability: "stock_video",
  provider: "loc",
  status: "beta",
  integration: { kind: "api", env: [], install: "no auth required" },
  best_for: "Searching Library of Congress film and video records for public-domain documentary assets.",
  supports: ["stock-video", "public-domain", "library-of-congress"],
  cost: { unit: "call", usd: 0 },
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    const input = stockVideoInputSchema.parse(params);

    return fetchStockVideo({
      provider: "loc",
      url: buildUrl(ENDPOINT, { q: input.query, fo: "json", fa: "original-format:film,+video" }),
      input,
      ctx,
      map: mapLoc,
    });
  },
});

function mapLoc(payload: unknown): StockVideoMatch[] {
  if (!isRecord(payload)) {
    return [];
  }

  return recordArrayField(payload, "results").flatMap((item) => {
    const videoUrl = stringField(item, "video_url", "download_url", "url") ?? firstResourceFileUrl(item);

    if (!videoUrl) {
      return [];
    }

    return [
      {
        video_url: videoUrl,
        thumbnail_url: stringField(item, "image_url", "thumbnail_url"),
        duration: numberField(item, "duration"),
        attribution: {
          source: "loc",
          author: stringField(item, "contributor") ?? stringArrayField(item, "contributor")[0],
          source_url: stringField(item, "url", "source_url"),
          license: "Public Domain (LoC public-domain collection)",
        },
      },
    ];
  });
}

function firstResourceFileUrl(item: Record<string, unknown>): string | undefined {
  for (const resource of recordArrayField(item, "resources")) {
    for (const file of recordArrayField(resource, "files")) {
      const url = stringField(file, "url", "download_url");
      if (url) {
        return url;
      }
    }
  }

  return undefined;
}
