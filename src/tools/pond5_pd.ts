import { defineTool } from "../registry/define-tool.js";
import { envValue, searchStockVideoManifest, stockVideoInputSchema, stockVideoOutputSchema } from "../tool-support/stock-video.js";

export default defineTool({
  name: "pond5_pd",
  capability: "stock_video",
  provider: "pond5",
  status: "beta",
  integration: {
    kind: "api",
    env: ["POND5_PD_FEED_URL"],
    install: "set POND5_PD_FEED_URL to a curated JSON manifest of Pond5 public-domain clips",
  },
  best_for: "Searching a configured Pond5 public-domain video manifest.",
  supports: ["stock-video", "manifest-search", "public-domain"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["stock-video", "pond5"],
  input: stockVideoInputSchema,
  output: stockVideoOutputSchema,
  async execute(params, ctx) {
    return searchStockVideoManifest({
      provider: "pond5",
      feedUrl: envValue("POND5_PD_FEED_URL"),
      input: stockVideoInputSchema.parse(params),
      ctx,
      license: "Public Domain",
    });
  },
});
