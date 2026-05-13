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

const faceEnhance = defineTool({
  name: "face_enhance",
  capability: "face_enhance",
  provider: "predit",
  status: "beta",
  integration: {
    kind: "library",
    package: "predit",
    install: "pnpm add predit",
  },
  best_for: "capability discovery for general face detail enhancement in portraits and character assets",
  supports: ["face-detail", "portrait-enhancement", "provider-selection"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(): Promise<z.infer<typeof outputSchema>> {
    throw new Error(
      "face_enhance is a capability marker; choose a concrete provider with registry.select('face_enhance') before executing face enhancement",
    );
  },
});

export default faceEnhance;
