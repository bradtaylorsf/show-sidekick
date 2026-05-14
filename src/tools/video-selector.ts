import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "video_selector",
  capability: "image_to_video",
  best_for: "OpenMontage-compatible video provider selection for generated motion clips",
  supports: ["image-to-video", "motion-clips", "openmontage-tool-name"],
});
