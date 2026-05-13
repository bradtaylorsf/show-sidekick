import { z } from "zod";
import { defineTool } from "../registry/index.js";

const wordSchema = z.object({
  text: z.string(),
  start_s: z.number(),
  end_s: z.number(),
  confidence: z.number().min(0).max(1),
});

const inputSchema = z.object({
  path: z.string().min(1),
  language: z.string().optional(),
});

const outputSchema = z.object({
  segments: z.array(
    z.object({
      text: z.string(),
      start_s: z.number(),
      end_s: z.number(),
      words: z.array(wordSchema),
    }),
  ),
});

const transcriber = defineTool({
  name: "transcriber",
  capability: "transcriber",
  provider: "predit",
  status: "beta",
  integration: {
    kind: "library",
    package: "predit",
    install: "pnpm add predit",
  },
  best_for: "capability discovery for concrete transcription providers",
  supports: ["whisper-cpp", "elevenlabs-scribe"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(): Promise<z.infer<typeof outputSchema>> {
    throw new Error(
      "transcriber is a capability marker; choose a concrete provider with registry.select('transcriber') before executing transcription",
    );
  },
});

export default transcriber;
