import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "web_search",
  capability: "web_search",
  best_for: "OpenMontage-compatible research capability marker for agent/browser web search",
  supports: ["research", "browser-search", "openmontage-tool-name"],
  executeMessage:
    "web_search is an agent-side research capability marker; use the connected browser/search capability and return an attributed research_brief",
});
