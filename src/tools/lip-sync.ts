import { z } from "zod";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  audio_path: z.string().min(1),
  source_path: z.string().min(1),
  output_path: z.string().min(1),
});

const outputSchema = z.object({
  video_path: z.string().min(1),
  duration_s: z.number().nonnegative(),
  source_modality: z.enum(["still", "video"]),
});

const lipSync = defineTool({
  name: "lip_sync",
  capability: "lip_sync",
  provider: "predit",
  status: "beta",
  integration: {
    kind: "library",
    package: "predit",
    install: "pnpm add predit",
  },
  best_for: "capability discovery for concrete lip-sync providers that animate a still or video from audio",
  supports: ["still-image-lip-sync", "video-lip-sync", "provider-selection"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(): Promise<z.infer<typeof outputSchema>> {
    throw new Error(
      "lip_sync is a capability marker; choose a concrete provider with registry.select('lip_sync') before executing lip-sync generation",
    );
  },
});

export default lipSync;
