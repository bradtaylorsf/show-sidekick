import { z } from "zod";
import { defineTool } from "../registry/index.js";

const wordSchema = z.object({
  text: z.string(),
  start_s: z.number(),
  end_s: z.number(),
  confidence: z.number(),
});

export default defineTool({
  name: "whisper-cpp",
  capability: "whisper",
  provider: "whisper-cpp",
  status: "production",
  integration: {
    kind: "binary",
    binary: "whisper-cli",
    install:
      "brew install whisper-cpp (macOS) or build from https://github.com/ggerganov/whisper.cpp; ensure whisper-cli is on PATH and provide a model via WHISPER_MODEL or ~/.cache/whisper",
  },
  best_for:
    "local word-level ASR; default medium.en for English, medium for other languages, large-v3 retry for music-heavy audio",
  input: z.object({
    audio_path: z.string(),
    language: z.string().optional(),
    model: z.string().optional(),
  }),
  output: z.object({
    segments: z.array(
      z.object({
        start_s: z.number(),
        end_s: z.number(),
        text: z.string(),
        words: z.array(wordSchema),
      }),
    ),
  }),
  async execute() {
    throw new Error("whisper-cpp.execute is implemented in A-3 (issue #38)");
  },
});
