import hyperframes from "./hyperframes.js";

export default {
  ...hyperframes,
  name: "hyperframes_compose",
  best_for: "Compatibility alias for HyperFrames composition specs",
  supports: [...(hyperframes.supports ?? []), "compat-alias"],
};
