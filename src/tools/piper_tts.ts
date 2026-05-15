import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { defineTool } from "../registry/define-tool.js";
import { ttsProviderInputSchema, ttsProviderOutputSchema } from "../tool-support/tts-provider.js";

const DEFAULT_MODEL = "en_US-lessac-medium";

export default defineTool({
  name: "piper_tts",
  capability: "tts",
  provider: "piper",
  status: "production",
  integration: { kind: "binary", binary: "piper", install: "brew install piper or pipx install piper-tts" },
  best_for: "Zero-cost local narration when a Piper voice model is installed.",
  supports: ["local-tts", "narration-audio"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["text-to-speech"],
  input: ttsProviderInputSchema,
  output: ttsProviderOutputSchema,
  async execute(params, ctx) {
    const input = ttsProviderInputSchema.parse(params);

    if (!ctx.runCli) {
      throw new Error("piper_tts requires ctx.runCli");
    }

    const model = input.voice_id ?? input.model ?? DEFAULT_MODEL;
    const outputPath = resolve(
      ctx.projectRoot,
      "projects",
      "_tool_runs",
      "audio",
      `piper-${Date.now().toString()}.${input.format ?? "wav"}`,
    );

    await mkdir(dirname(outputPath), { recursive: true });
    await ctx.runCli("piper", ["--model", model, "--output_file", outputPath], {
      cwd: ctx.projectRoot,
      input: input.text,
    });

    return ttsProviderOutputSchema.parse({
      audio_path: outputPath,
      cost_usd: 0,
      voice: input.voice_id,
      model,
    });
  },
});
