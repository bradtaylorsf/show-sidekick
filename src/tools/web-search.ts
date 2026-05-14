import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "web_search",
  capability: "web_search",
  best_for: "Agent-side research capability marker for browser-backed web search",
  supports: ["research", "browser-search", "compat-alias"],
  executeMessage:
    "web_search is an agent-side research capability marker; use the connected browser/search capability and return an attributed research_brief",
});
