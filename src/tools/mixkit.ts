import { defineTool } from "../registry/define-tool.js";
import { envValue, searchStockVideoManifest, stockVideoInputSchema, stockVideoOutputSchema } from "../tool-support/stock-video.js";

export default defineTool({
  name: "mixkit",
  capability: "stock_video",
  provider: "mixkit",
  status: "beta",
  integration: {
    kind: "api",
    env: ["MIXKIT_FEED_URL"],
    install: "set MIXKIT_FEED_URL to a curated JSON manifest of Mixkit clips",
  },
  best_for: "Searching a configured Mixkit stock-video manifest.",
  supports: ["stock-video", "manifest-search", "mixkit-license"],
  cost: { unit: "call", usd: 0 },
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    return searchStockVideoManifest({
      provider: "mixkit",
      feedUrl: envValue("MIXKIT_FEED_URL"),
      input: stockVideoInputSchema.parse(params),
      ctx,
      license: "Mixkit License",
    });
  },
});
