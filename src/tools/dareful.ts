import { defineTool } from "../registry/define-tool.js";
import { envValue, searchStockVideoManifest, stockVideoInputSchema, stockVideoOutputSchema } from "../tool-support/stock-video.js";

export default defineTool({
  name: "dareful",
  capability: "stock_video",
  provider: "dareful",
  status: "beta",
  integration: {
    kind: "api",
    env: ["DAREFUL_FEED_URL"],
    install: "set DAREFUL_FEED_URL to a curated JSON manifest of Dareful clips",
  },
  best_for: "Searching a configured Dareful stock-video manifest with CC BY attribution.",
  supports: ["stock-video", "manifest-search", "cc-by-4.0"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["stock-video", "dareful"],
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    return searchStockVideoManifest({
      provider: "dareful",
      feedUrl: envValue("DAREFUL_FEED_URL"),
      input: stockVideoInputSchema.parse(params),
      ctx,
      license: "CC BY 4.0",
    });
  },
});
