import { defineTool } from "../registry/define-tool.js";
import {
  fetchStockVideo,
  isRecord,
  recordArrayField,
  stockVideoInputSchema,
  stockVideoOutputSchema,
  stringArrayField,
  stringField,
  type StockVideoInput,
  type StockVideoMatch,
} from "../tool-support/stock-video.js";

const ENDPOINT = "https://archive.org/advancedsearch.php";

export default defineTool({
  name: "archive_org",
  capability: "stock_video",
  provider: "archive_org",
  status: "beta",
  integration: { kind: "api", env: [], install: "no auth required" },
  best_for: "Searching Internet Archive movies and public-domain moving-image collections.",
  supports: ["stock-video", "public-domain", "internet-archive"],
  cost: { unit: "call", usd: 0 },
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    const input = stockVideoInputSchema.parse(params);

    return fetchStockVideo({
      provider: "archive_org",
      url: archiveSearchUrl(input),
      input,
      ctx,
      map: mapArchiveOrg,
    });
  },
});

function archiveSearchUrl(input: StockVideoInput): string {
  const url = new URL(ENDPOINT);
  url.searchParams.set("q", `${input.query} AND mediatype:movies`);
  for (const field of ["identifier", "title", "creator"]) {
    url.searchParams.append("fl[]", field);
  }
  url.searchParams.set("rows", String(input.per_page));
  url.searchParams.set("output", "json");
  return url.toString();
}

function mapArchiveOrg(payload: unknown): StockVideoMatch[] {
  if (!isRecord(payload)) {
    return [];
  }

  const response = isRecord(payload.response) ? payload.response : {};

  return recordArrayField(response, "docs").flatMap((doc) => {
    const identifier = stringField(doc, "identifier");

    if (!identifier) {
      return [];
    }

    const creator = stringField(doc, "creator") ?? stringArrayField(doc, "creator")[0];

    return [
      {
        video_url: `https://archive.org/download/${encodeURIComponent(identifier)}`,
        thumbnail_url: `https://archive.org/services/img/${encodeURIComponent(identifier)}`,
        attribution: {
          source: "archive_org",
          author: creator,
          source_url: `https://archive.org/details/${encodeURIComponent(identifier)}`,
          license: "Public Domain (varies by item)",
        },
      },
    ];
  });
}
