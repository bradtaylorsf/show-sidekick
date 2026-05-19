import { z } from "zod";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  output_path: z.string().min(1),
  duration_s: z.number().positive().optional(),
});

const outputSchema = z.object({
  video_path: z.string().min(1),
  duration_s: z.number().nonnegative(),
});

const screenCaptureSelector = defineTool({
  name: "screen_capture_selector",
  capability: "screen_capture",
  provider: "show-sidekick",
  status: "beta",
  integration: {
    kind: "library",
    package: "show-sidekick",
    install: "npm install show-sidekick",
  },
  best_for: "capability discovery for selecting a concrete screen capture provider",
  supports: ["screen-capture", "provider-selection"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(): Promise<z.infer<typeof outputSchema>> {
    throw new Error(
      "screen_capture_selector is a capability marker; choose a concrete provider with registry.select('screen_capture') before executing screen capture",
    );
  },
});

export default screenCaptureSelector;
