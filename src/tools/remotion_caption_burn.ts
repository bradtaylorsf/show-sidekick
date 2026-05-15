import remotion from "./remotion.js";

export default {
  ...remotion,
  name: "remotion_caption_burn",
  best_for: "Compatibility alias for Remotion caption burn and compose validation",
  supports: [...(remotion.supports ?? []), "compat-alias"],
};
