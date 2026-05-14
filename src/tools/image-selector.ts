import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "image_selector",
  capability: "image_generation",
  best_for: "OpenMontage-compatible image provider selection for still assets and support graphics",
  supports: ["image-generation", "still-assets", "openmontage-tool-name"],
});
