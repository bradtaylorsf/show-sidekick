import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "stock_video",
  capability: "stock_video",
  best_for: "Compatibility alias for selecting a concrete stock video provider.",
  supports: ["stock-video", "source-media", "compat-alias"],
});
