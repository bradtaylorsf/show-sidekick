import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "tts_selector",
  capability: "tts",
  best_for: "OpenMontage-compatible TTS provider selection before generating narration audio",
  supports: ["tts", "narration-audio", "openmontage-tool-name"],
});
