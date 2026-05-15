import { defineTool } from "../registry/define-tool.js";
import { envValue, searchStockVideoManifest, stockVideoInputSchema, stockVideoOutputSchema } from "../tool-support/stock-video.js";

export default defineTool({
  name: "videvo",
  capability: "stock_video",
  provider: "videvo",
  status: "beta",
  integration: {
    kind: "api",
    env: ["VIDEVO_FEED_URL"],
    install: "set VIDEVO_FEED_URL to a curated JSON manifest of Videvo clips",
  },
  best_for: "Searching a configured Videvo stock-video manifest while preserving per-clip license metadata.",
  supports: ["stock-video", "manifest-search", "videvo-license"],
  cost: { unit: "call", usd: 0 },
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    return searchStockVideoManifest({
      provider: "videvo",
      feedUrl: envValue("VIDEVO_FEED_URL"),
      input: stockVideoInputSchema.parse(params),
      ctx,
      license: "Videvo License",
    });
  },
});
