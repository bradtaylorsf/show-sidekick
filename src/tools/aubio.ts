import { z } from "zod";
import { defineTool } from "../registry/index.js";

export default defineTool({
  name: "aubio",
  capability: "aubio",
  provider: "aubio",
  status: "production",
  integration: {
    kind: "binary",
    binary: "aubio",
    install: "brew install aubio (macOS) or apt install aubio-tools (Linux)",
  },
  best_for: "beat and tempo detection through aubio beat / aubio tempo",
  input: z.object({
    audio_path: z.string(),
    expect_bpm: z.tuple([z.number(), z.number()]).optional(),
  }),
  output: z.object({
    bpm: z.number(),
    beats: z.array(
      z.object({
        time_s: z.number(),
        strength: z.number(),
        is_downbeat: z.boolean(),
      }),
    ),
  }),
  async execute() {
    throw new Error("aubio.execute is implemented in A-5 (issue #40)");
  },
});
