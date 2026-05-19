import { z } from "zod";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  script: z.string().min(1),
  voice_id: z.string().min(1),
  avatar_id: z.string().min(1),
  output_path: z.string().min(1),
  language: z.string().min(1).optional(),
});

const outputSchema = z.object({
  video_path: z.string().min(1),
  duration_s: z.number().nonnegative(),
  provider_metadata: z.record(z.string(), z.unknown()).default({}),
});

const talkingHead = defineTool({
  name: "talking_head",
  capability: "talking_head",
  provider: "show-sidekick",
  status: "beta",
  integration: {
    kind: "library",
    package: "show-sidekick",
    install: "npm install show-sidekick",
  },
  best_for: "capability discovery for avatar presenter generation from script, voice, and avatar selection",
  supports: ["avatar-presenter", "script-to-video", "provider-selection"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(): Promise<z.infer<typeof outputSchema>> {
    throw new Error(
      "talking_head is a capability marker; choose a concrete provider with registry.select('talking_head') before executing talking-head generation",
    );
  },
});

export default talkingHead;
