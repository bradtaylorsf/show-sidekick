import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "video_selector",
  capability: "image_to_video",
  best_for: "Provider-selection marker for choosing a concrete image-to-video tool at runtime",
  supports: ["image-to-video", "motion-clips", "compat-alias"],
});
