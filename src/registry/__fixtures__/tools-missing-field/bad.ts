import { z } from "zod";

export default {
  name: "bad",
  provider: "broken",
  status: "beta",
  integration: { kind: "api", env: ["BAD_KEY"], install: "set BAD_KEY" },
  best_for: "invalid fixture",
  input: z.object({ text: z.string() }),
  output: z.object({ path: z.string() }),
  isAvailable: async () => ({ available: true }),
  execute: async (params: { text: string }) => ({ path: params.text }),
};
