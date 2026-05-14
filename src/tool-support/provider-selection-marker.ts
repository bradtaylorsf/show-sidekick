import { z } from "zod";
import { defineTool, type Capability } from "../registry/index.js";

const markerInputSchema = z
  .object({
    prefer: z.array(z.string()).optional(),
    runtime: z.string().optional(),
    context: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const markerOutputSchema = z
  .object({
    selected_tool: z.string(),
    capability: z.string(),
  })
  .passthrough();

export type ProviderSelectionMarkerConfig = {
  name: string;
  capability: Capability;
  best_for: string;
  supports: string[];
  executeMessage?: string;
};

export function providerSelectionMarker(config: ProviderSelectionMarkerConfig) {
  return defineTool({
    name: config.name,
    capability: config.capability,
    provider: "predit",
    status: "beta",
    integration: {
      kind: "library",
      package: "predit",
      install: "bundled",
    },
    best_for: config.best_for,
    supports: ["provider-selection", ...config.supports],
    input: markerInputSchema,
    output: markerOutputSchema,
    isAvailable: async () => ({ available: true }),
    async execute() {
      throw new Error(
        config.executeMessage ??
          `${config.name} is a provider-selection marker; choose a concrete provider with registry.select('${config.capability}') before executing`,
      );
    },
  });
}
