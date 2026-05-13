import { z } from "zod";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  source_path: z.string().min(1),
  output_path: z.string().min(1),
  format: z.enum(["png", "webm"]).optional(),
});

const outputSchema = z.object({
  output_path: z.string().min(1),
  provider_metadata: z.record(z.string(), z.unknown()).default({}),
});

const bgRemove = defineTool({
  name: "bg_remove",
  capability: "bg_remove",
  provider: "predit",
  status: "beta",
  integration: {
    kind: "library",
    package: "predit",
    install: "pnpm add predit",
  },
  best_for: "capability discovery for background removal from still images or short clips",
  supports: ["background-removal", "alpha-output", "provider-selection"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(): Promise<z.infer<typeof outputSchema>> {
    throw new Error(
      "bg_remove is a capability marker; choose a concrete provider with registry.select('bg_remove') before executing background removal",
    );
  },
});

export default bgRemove;
