import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "image_selector",
  capability: "image_generation",
  best_for: "Provider-selection marker for choosing a concrete image-generation tool at runtime",
  supports: ["image-generation", "still-assets", "compat-alias"],
});
