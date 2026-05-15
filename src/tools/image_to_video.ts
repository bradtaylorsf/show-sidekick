import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "image_to_video",
  capability: "image_to_video",
  best_for: "Compatibility alias for selecting a concrete image-to-video provider.",
  supports: ["image-to-video", "motion-clips", "compat-alias"],
});
