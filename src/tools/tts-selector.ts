import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "tts_selector",
  capability: "tts",
  best_for: "Provider-selection marker for choosing a concrete TTS tool at runtime",
  supports: ["tts", "narration-audio", "compat-alias"],
});
