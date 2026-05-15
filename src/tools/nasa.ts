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
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    const input = stockVideoInputSchema.parse(params);

    return fetchStockVideo({
      provider: "nasa",
      url: buildUrl(ENDPOINT, { q: input.query, media_type: "video" }),
      input,
      ctx,
      map: mapNasa,
    });
  },
});

async function mapNasa(payload: unknown): Promise<StockVideoMatch[]> {
  if (!isRecord(payload) || !isRecord(payload.collection)) {
    return [];
  }

  const matches = await Promise.all(recordArrayField(payload.collection, "items").map(async (item): Promise<StockVideoMatch | undefined> => {
    const data = recordArrayField(item, "data")[0] ?? {};
    const links = recordArrayField(item, "links");
    const nasaId = stringField(data, "nasa_id");
    const directVideoUrl = stringField(item, "video_url") ?? stringField(data, "video_url");
    const href = stringField(item, "href");
    const videoUrl = isVideoUrl(directVideoUrl) ? directVideoUrl : await resolveNasaAssetUrl(href);

    if (!videoUrl) {
      return undefined;
    }

    const thumbnailUrl = links.map((link) => stringField(link, "href")).find((href) => href !== undefined);
    const author = stringField(data, "photographer", "center");
    const sourceUrl = nasaId ? `https://images.nasa.gov/details-${encodeURIComponent(nasaId)}` : href;
    const match: StockVideoMatch = {
      video_url: videoUrl,
      attribution: {
        source: "nasa",
        license: "Public Domain (NASA)",
      },
    };
    if (thumbnailUrl) {
      match.thumbnail_url = thumbnailUrl;
    }
    if (author) {
      match.attribution.author = author;
    }
    if (sourceUrl) {
      match.attribution.source_url = sourceUrl;
    }

    return match;
  }));

  return matches.filter((match): match is StockVideoMatch => match !== undefined);
}

async function resolveNasaAssetUrl(href: string | undefined): Promise<string | undefined> {
  if (!href) {
    return undefined;
  }

  if (isVideoUrl(href)) {
    return href;
  }

  const response = await fetch(href);
  if (!response.ok) {
    throw new Error(`nasa asset collection request failed (${response.status}): ${await response.text()}`);
  }

  return findVideoUrl(await response.json());
}

function findVideoUrl(value: unknown): string | undefined {
  if (typeof value === "string") {
    return isVideoUrl(value) ? value : undefined;
  }

  if (Array.isArray(value)) {
    return value.map(findVideoUrl).find((url) => url !== undefined);
  }

  if (!isRecord(value)) {
    return undefined;
  }

  return Object.values(value).map(findVideoUrl).find((url) => url !== undefined);
}

function isVideoUrl(value: string | undefined): value is string {
  return value !== undefined && /\.(mp4|mov|m4v|webm)(?:$|[?#])/iu.test(value);
}
