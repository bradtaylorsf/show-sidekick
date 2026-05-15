import { defineTool } from "../registry/define-tool.js";
import {
  buildUrl,
  fetchStockVideo,
  isRecord,
  recordArrayField,
  recordField,
  stockVideoInputSchema,
  stockVideoOutputSchema,
  stringField,
  type StockVideoMatch,
} from "../tool-support/stock-video.js";

const ENDPOINT = "https://catalog.archives.gov/api/v2/records/search";

export default defineTool({
  name: "nara",
  capability: "stock_video",
  provider: "nara",
  status: "beta",
  integration: { kind: "api", env: [], install: "no auth required" },
  best_for: "Searching National Archives video records for public-domain US government footage.",
  supports: ["stock-video", "public-domain", "national-archives"],
  cost: { unit: "call", usd: 0 },
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    const input = stockVideoInputSchema.parse(params);

    return fetchStockVideo({
      provider: "nara",
      url: buildUrl(ENDPOINT, { q: input.query, recordType: "Video", rows: input.per_page }),
      input,
      ctx,
      map: mapNara,
    });
  },
});

function mapNara(payload: unknown): StockVideoMatch[] {
  const hits = naraHits(payload);

  return hits.flatMap((hit) => {
    const source = recordField(hit, "_source") ?? hit;
    const naId = stringField(source, "naId", "id");
    const videoUrl = stringField(source, "video_url", "objectUrl", "url") ?? firstDigitalObjectUrl(source);

    if (!videoUrl) {
      return [];
    }

    return [
      {
        video_url: videoUrl,
        thumbnail_url: stringField(source, "thumbnail_url", "thumbnailUrl"),
        attribution: {
          source: "nara",
          author: stringField(source, "creator", "recordGroup"),
          source_url: naId ? `https://catalog.archives.gov/id/${encodeURIComponent(naId)}` : stringField(source, "source_url", "url"),
          license: "Public Domain (US Government work)",
        },
      },
    ];
  });
}

function naraHits(payload: unknown): Record<string, unknown>[] {
  if (!isRecord(payload)) {
    return [];
  }

  const body = recordField(payload, "body") ?? payload;
  const hits = recordField(body, "hits");

  if (hits) {
    return recordArrayField(hits, "hits");
  }

  return recordArrayField(body, "records", "results");
}

function firstDigitalObjectUrl(source: Record<string, unknown>): string | undefined {
  for (const key of ["objects", "digitalObjects"]) {
    for (const object of recordArrayField(source, key)) {
      const url = stringField(object, "objectUrl", "url");
      if (url) {
        return url;
      }
    }
  }

  return undefined;
}
