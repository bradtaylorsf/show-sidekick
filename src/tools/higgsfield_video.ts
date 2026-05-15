import higgsfield from "./higgsfield.js";

export default {
  ...higgsfield,
  name: "higgsfield_video",
  best_for: "Compatibility alias for Higgsfield image-to-video generation",
  supports: [...(higgsfield.supports ?? []), "compat-alias"],
};
