import { providerSelectionMarker } from "../tool-support/provider-selection-marker.js";

export default providerSelectionMarker({
  name: "whisper",
  capability: "whisper",
  best_for: "Compatibility alias for selecting a concrete Whisper transcription provider.",
  supports: ["whisper-cpp", "word-timing", "compat-alias"],
});
