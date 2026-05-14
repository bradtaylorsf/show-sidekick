import hyperframes from "./hyperframes.js";

export default {
  ...hyperframes,
  name: "hyperframes_compose",
  best_for: "OpenMontage-compatible alias for HyperFrames composition specs",
  supports: [...(hyperframes.supports ?? []), "openmontage-tool-name"],
};
