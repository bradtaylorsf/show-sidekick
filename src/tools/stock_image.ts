import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "stock_image",
  capability: "stock_image",
  best_for: "Compatibility alias for selecting a concrete stock image provider.",
  supports: ["stock-image", "source-media", "compat-alias"],
});
