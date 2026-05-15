import { defineTool } from "../registry/define-tool.js";
import { envValue, searchStockVideoManifest, stockVideoInputSchema, stockVideoOutputSchema } from "../tool-support/stock-video.js";

export default defineTool({
  name: "coverr",
  capability: "stock_video",
  provider: "coverr",
  status: "beta",
  integration: {
    kind: "api",
    env: ["COVERR_FEED_URL"],
    install: "set COVERR_FEED_URL to a curated JSON manifest of Coverr clips",
  },
  best_for: "Searching a configured Coverr free stock-video manifest.",
  supports: ["stock-video", "manifest-search", "coverr-license"],
  cost: { unit: "call", usd: 0 },
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    return searchStockVideoManifest({
      provider: "coverr",
      feedUrl: envValue("COVERR_FEED_URL"),
      input: stockVideoInputSchema.parse(params),
      ctx,
      license: "Coverr License (free for commercial use, no attribution required)",
    });
  },
});
