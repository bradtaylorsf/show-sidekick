import { z } from "zod";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  source_path: z.string().min(1),
  output_path: z.string().min(1),
  scale: z.number().int().min(2),
});

const outputSchema = z.object({
  output_path: z.string().min(1),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  provider_metadata: z.record(z.string(), z.unknown()).default({}),
});

const upscale = defineTool({
  name: "upscale",
  capability: "upscale",
  provider: "predit",
  status: "beta",
  integration: {
    kind: "library",
    package: "predit",
    install: "pnpm add predit",
  },
  best_for: "capability discovery for increasing image or clip resolution",
  supports: ["upscale", "resolution-enhancement", "provider-selection"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(): Promise<z.infer<typeof outputSchema>> {
    throw new Error(
      "upscale is a capability marker; choose a concrete provider with registry.select('upscale') before executing upscaling",
    );
  },
});

export default upscale;
