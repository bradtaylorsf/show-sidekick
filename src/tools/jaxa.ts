import { defineTool } from "../registry/define-tool.js";
import { envValue, searchStockVideoManifest, stockVideoInputSchema, stockVideoOutputSchema } from "../tool-support/stock-video.js";

export default defineTool({
  name: "jaxa",
  capability: "stock_video",
  provider: "jaxa",
  status: "beta",
  integration: {
    kind: "api",
    env: ["JAXA_FEED_URL"],
    install: "set JAXA_FEED_URL to a curated JSON manifest of JAXA clips",
  },
  best_for: "Searching a configured JAXA space and science video manifest.",
  supports: ["stock-video", "space", "science", "manifest-search"],
  cost: { unit: "call", usd: 0 },
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    return searchStockVideoManifest({
      provider: "jaxa",
      feedUrl: envValue("JAXA_FEED_URL"),
      input: stockVideoInputSchema.parse(params),
      ctx,
      license: "JAXA Public Use License",
    });
  },
});
