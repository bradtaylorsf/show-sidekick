import characterAnimation from "./character-animation.js";

export default {
  ...characterAnimation,
  name: "character_rig_renderer",
  best_for: "Compatibility alias for character rig rendering",
  supports: [...(characterAnimation.supports ?? []), "compat-alias"],
};
