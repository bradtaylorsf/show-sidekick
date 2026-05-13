import { z } from "zod";
import { defineTool } from "../../define-tool.js";

export default defineTool({
  name: "dup",
  capability: "image_generation",
  provider: "two",
  status: "beta",
  integration: { kind: "api", env: ["TWO_KEY"], install: "set TWO_KEY" },
  best_for: "duplicate fixture",
  input: z.object({ prompt: z.string() }),
  output: z.object({ path: z.string() }),
  isAvailable: async () => ({ available: true }),
  execute: async (params) => ({ path: params.prompt }),
});
