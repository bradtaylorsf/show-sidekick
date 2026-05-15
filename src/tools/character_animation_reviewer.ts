import characterAnimation from "./character-animation.js";

export default {
  ...characterAnimation,
  name: "character_animation_reviewer",
  best_for: "Compatibility alias for character animation review",
  supports: [...(characterAnimation.supports ?? []), "compat-alias"],
};
