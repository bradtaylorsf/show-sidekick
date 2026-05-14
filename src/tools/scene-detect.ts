import sceneDetector from "./scene-detector.js";

export default {
  ...sceneDetector,
  name: "scene_detect",
  best_for: "Compatibility alias for ffmpeg scene cut detection",
  supports: [...(sceneDetector.supports ?? []), "compat-alias"],
};
