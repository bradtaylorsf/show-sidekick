import { z } from "zod";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  source_path: z.string().min(1),
  output_path: z.string().min(1),
  lut_path: z.string().min(1).optional(),
  contrast: z.number().optional(),
  saturation: z.number().optional(),
});

const outputSchema = z.object({
  output_path: z.string().min(1),
  provider_metadata: z.record(z.string(), z.unknown()).default({}),
});

const colorGrade = defineTool({
  name: "color_grade",
  capability: "color_grade",
  provider: "show-sidekick",
  status: "beta",
  integration: {
    kind: "library",
    package: "show-sidekick",
    install: "npm install show-sidekick",
  },
  best_for: "capability discovery for applying LUTs and simple color transforms to media",
  supports: ["lut", "contrast", "saturation", "provider-selection"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(): Promise<z.infer<typeof outputSchema>> {
    throw new Error(
      "color_grade is a capability marker; choose a concrete provider with registry.select('color_grade') before executing color grading",
    );
  },
});

export default colorGrade;
