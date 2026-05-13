import { z } from "zod";
import { defineTool } from "../../define-tool.js";

export default defineTool({
  name: "gamma",
  capability: "tts",
  provider: "bravo",
  status: "experimental",
  integration: { kind: "binary", binary: "say", install: "macOS includes say" },
  best_for: "local voice scratch tracks",
  input: z.object({ text: z.string() }),
  output: z.object({ path: z.string() }),
  isAvailable: async () => ({ available: true }),
  execute: async (params) => ({ path: `${params.text}.aiff` }),
});
