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

const ENDPOINT = "https://api.pexels.com/videos/search";

export default defineTool({
  name: "pexels_video",
  capability: "stock_video",
  provider: "pexels",
  status: "beta",
  integration: { kind: "api", env: ["PEXELS_API_KEY"], install: "set PEXELS_API_KEY" },
  best_for: "Searching free stock video clips from Pexels with attribution metadata.",
  supports: ["stock-video", "pexels-license"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["stock-video", "pexels"],
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    const input = stockVideoInputSchema.parse(params);

    return fetchStockVideo({
      provider: "pexels",
      url: buildUrl(ENDPOINT, { query: input.query, per_page: input.per_page }),
      headers: { Authorization: envValue("PEXELS_API_KEY") },
      input,
      ctx,
      map: mapPexels,
    });
  },
});

function mapPexels(payload: unknown): StockVideoMatch[] {
  if (!isRecord(payload) || !Array.isArray(payload.videos)) {
    return [];
  }

  return payload.videos.filter(isRecord).flatMap((video) => {
    const user = isRecord(video.user) ? video.user : {};
    const files = Array.isArray(video.video_files) ? video.video_files.filter(isRecord) : [];
    const file = pickPexelsFile(files);
    const videoUrl = file ? stringField(file, "link") : undefined;

    if (!file || !videoUrl) {
      return [];
    }

    return [
      {
        video_url: videoUrl,
        thumbnail_url: stringField(video, "image"),
        duration: numberField(video, "duration"),
        width: numberField(file, "width") ?? numberField(video, "width"),
        height: numberField(file, "height") ?? numberField(video, "height"),
        attribution: {
          source: "pexels",
          author: stringField(user, "name"),
          source_url: stringField(video, "url"),
          license: "Pexels License",
        },
      },
    ];
  });
}

function pickPexelsFile(files: Record<string, unknown>[]): Record<string, unknown> | undefined {
  return (
    files.find((file) => stringField(file, "file_type") === "video/mp4" && stringField(file, "quality") === "hd") ??
    files.find((file) => stringField(file, "file_type") === "video/mp4") ??
    files[0]
  );
}
