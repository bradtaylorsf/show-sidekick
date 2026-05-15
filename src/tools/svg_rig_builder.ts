import characterAnimation from "./character-animation.js";

export default {
  ...characterAnimation,
  name: "svg_rig_builder",
  best_for: "Compatibility alias for SVG character rig building",
  supports: [...(characterAnimation.supports ?? []), "compat-alias"],
};
