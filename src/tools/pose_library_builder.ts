import characterAnimation from "./character-animation.js";

export default {
  ...characterAnimation,
  name: "pose_library_builder",
  best_for: "Compatibility alias for character pose library building",
  supports: [...(characterAnimation.supports ?? []), "compat-alias"],
};
