import { z } from "zod";
import { defineTool } from "../../define-tool.js";

export default defineTool({
  name: "beta",
  capability: "image_generation",
  provider: "bravo",
  status: "production",
  integration: { kind: "library", package: "zod", install: "pnpm add zod" },
  best_for: "still images",
  input: z.object({ prompt: z.string() }),
  output: z.object({ path: z.string() }),
  isAvailable: async () => ({ available: true }),
  execute: async (params) => ({ path: `${params.prompt}.png` }),
});
