import { z } from "zod";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  source_path: z.string().min(1),
  output_path: z.string().min(1),
  strength: z.number().optional(),
});

const outputSchema = z.object({
  output_path: z.string().min(1),
  provider_metadata: z.record(z.string(), z.unknown()).default({}),
});

const eyeEnhance = defineTool({
  name: "eye_enhance",
  capability: "eye_enhance",
  provider: "predit",
  status: "beta",
  integration: {
    kind: "library",
    package: "predit",
    install: "pnpm add predit",
  },
  best_for: "capability discovery for sharpening and clarifying eyes in character or portrait assets",
  supports: ["eye-detail", "portrait-enhancement", "provider-selection"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(): Promise<z.infer<typeof outputSchema>> {
    throw new Error(
      "eye_enhance is a capability marker; choose a concrete provider with registry.select('eye_enhance') before executing eye enhancement",
    );
  },
});

export default eyeEnhance;
