import clipSearch from "./clip_search.js";

export default {
  ...clipSearch,
  name: "direct_clip_search",
  best_for: "Compatibility alias for direct generated-clip corpus search",
  supports: [...(clipSearch.supports ?? []), "compat-alias"],
};
