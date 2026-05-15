import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "image_hosting",
  capability: "image_hosting",
  best_for: "Compatibility alias for selecting a concrete image hosting provider.",
  supports: ["image-hosting", "hosted-assets", "compat-alias"],
});
