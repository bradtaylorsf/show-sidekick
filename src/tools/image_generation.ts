import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "image_generation",
  capability: "image_generation",
  best_for: "Compatibility alias for selecting a concrete image generation provider.",
  supports: ["image-generation", "still-assets", "compat-alias"],
});
