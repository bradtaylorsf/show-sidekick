import characterAnimation from "./character-animation.js";

export default {
  ...characterAnimation,
  name: "action_timeline_compiler",
  best_for: "Compatibility alias for action timeline compilation",
  supports: [...(characterAnimation.supports ?? []), "compat-alias"],
};
