import characterAnimation from "./character-animation.js";

export default {
  ...characterAnimation,
  name: "character_spec_generator",
  best_for: "Compatibility alias for character animation specification generation",
  supports: [...(characterAnimation.supports ?? []), "compat-alias"],
};
