import { defineTool } from "../registry/define-tool.js";
import { envValue, searchStockVideoManifest, stockVideoInputSchema, stockVideoOutputSchema } from "../tool-support/stock-video.js";

export default defineTool({
  name: "noaa",
  capability: "stock_video",
  provider: "noaa",
  status: "beta",
  integration: {
    kind: "api",
    env: ["NOAA_FEED_URL"],
    install: "set NOAA_FEED_URL to a curated JSON manifest of NOAA public-domain clips",
  },
  best_for: "Searching a configured NOAA public-domain science and weather video manifest.",
  supports: ["stock-video", "public-domain", "science", "manifest-search"],
  cost: { unit: "call", usd: 0 },
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    return searchStockVideoManifest({
      provider: "noaa",
      feedUrl: envValue("NOAA_FEED_URL"),
      input: stockVideoInputSchema.parse(params),
      ctx,
      license: "Public Domain (US Government work)",
    });
  },
});
