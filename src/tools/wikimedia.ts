import { defineTool } from "../registry/define-tool.js";
import {
  fetchStockVideo,
  isRecord,
  recordArrayField,
  recordField,
  stockVideoInputSchema,
  stockVideoOutputSchema,
  stringField,
  type StockVideoInput,
  type StockVideoMatch,
} from "../tool-support/stock-video.js";

const ENDPOINT = "https://commons.wikimedia.org/w/api.php";

export default defineTool({
  name: "wikimedia",
  capability: "stock_video",
  provider: "wikimedia",
  status: "beta",
  integration: { kind: "api", env: [], install: "no auth required" },
  best_for: "Searching Wikimedia Commons video files with per-file license metadata.",
  supports: ["stock-video", "wikimedia-commons", "creative-commons", "public-domain"],
  cost: { unit: "call", usd: 0 },
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    const input = stockVideoInputSchema.parse(params);

    return fetchStockVideo({
      provider: "wikimedia",
      url: wikimediaSearchUrl(input),
      input,
      ctx,
      map: mapWikimedia,
    });
  },
});

function wikimediaSearchUrl(input: StockVideoInput): string {
  const url = new URL(ENDPOINT);
  url.searchParams.set("action", "query");
  url.searchParams.set("generator", "search");
  url.searchParams.set("gsrnamespace", "6");
  url.searchParams.set("gsrsearch", `${input.query} filetype:video`);
  url.searchParams.set("gsrlimit", String(input.per_page));
  url.searchParams.set("prop", "imageinfo");
  url.searchParams.set("iiprop", "url|extmetadata");
  url.searchParams.set("format", "json");
  return url.toString();
}

function mapWikimedia(payload: unknown): StockVideoMatch[] {
  if (!isRecord(payload) || !isRecord(payload.query) || !isRecord(payload.query.pages)) {
    return [];
  }

  return Object.values(payload.query.pages)
    .filter(isRecord)
    .flatMap((page) => {
      const imageInfo = recordArrayField(page, "imageinfo")[0] ?? {};
      const metadata = recordField(imageInfo, "extmetadata") ?? {};
      const videoUrl = stringField(imageInfo, "url");

      if (!videoUrl) {
        return [];
      }

      return [
        {
          video_url: videoUrl,
          thumbnail_url: stringField(imageInfo, "thumburl"),
          attribution: {
            source: "wikimedia",
            author: cleanMetadataValue(recordField(metadata, "Artist")),
            source_url: stringField(imageInfo, "descriptionurl"),
            license:
              cleanMetadataValue(recordField(metadata, "LicenseShortName")) ??
              cleanMetadataValue(recordField(metadata, "License")) ??
              "Wikimedia Commons license",
          },
        },
      ];
    });
}

function cleanMetadataValue(record: Record<string, unknown> | undefined): string | undefined {
  const value = record ? stringField(record, "value") : undefined;
  return value?.replace(/<[^>]*>/g, "").trim() || undefined;
}
