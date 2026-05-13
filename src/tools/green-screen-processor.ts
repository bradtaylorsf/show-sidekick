import { z } from "zod";
import { runFfmpeg } from "../media/ffmpeg-runner.js";
import { defineTool } from "../registry/index.js";

const INSTALL_INSTRUCTIONS = `macOS: brew install ffmpeg
Linux: sudo apt-get update && sudo apt-get install ffmpeg
Windows: winget install Gyan.FFmpeg`;

export const GreenScreenProcessorInputSchema = z.object({
  input: z.string(),
  output: z.string(),
  key_color: z.string().default("0x00FF00"),
  similarity: z.number().min(0).max(1).default(0.3),
  blend: z.number().min(0).max(1).default(0.1),
  alpha_quality: z.enum(["fast", "high"]).default("fast"),
});

export const GreenScreenProcessorOutputSchema = z.object({
  operation: z.literal("green_screen_processor"),
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number().int(),
  output_path: z.string(),
  key_color: z.string(),
  similarity: z.number(),
  blend: z.number(),
  alpha_quality: z.enum(["fast", "high"]),
});

export type GreenScreenProcessorInput = z.infer<typeof GreenScreenProcessorInputSchema>;
export type GreenScreenProcessorOutput = z.infer<typeof GreenScreenProcessorOutputSchema>;

export default defineTool({
  name: "green_screen_processor",
  capability: "video_compose",
  provider: "ffmpeg",
  status: "production",
  integration: {
    kind: "binary",
    binary: "ffmpeg",
    install: INSTALL_INSTRUCTIONS,
  },
  best_for: "extracting clean alpha mattes from green-screen footage",
  supports: ["chromakey", "alpha-matte", "prores-4444", "vp9-alpha"],
  input: GreenScreenProcessorInputSchema,
  output: GreenScreenProcessorOutputSchema,

  async execute(params) {
    const input = GreenScreenProcessorInputSchema.parse(params);
    const keyColor = normalizeColor(input.key_color);
    const filter = `format=rgba,chromakey=${keyColor}:${input.similarity}:${input.blend},format=${
      input.alpha_quality === "high" ? "yuva444p10le" : "yuva420p"
    }`;
    const codec =
      input.alpha_quality === "high"
        ? ["-c:v", "prores_ks", "-profile:v", "4444", "-pix_fmt", "yuva444p10le"]
        : ["-c:v", "libvpx-vp9", "-pix_fmt", "yuva420p", "-auto-alt-ref", "0"];
    const command = [
      "ffmpeg",
      "-y",
      "-hide_banner",
      "-i",
      input.input,
      "-vf",
      filter,
      "-an",
      ...codec,
      input.output,
    ];
    const result = await runFfmpeg(command);

    return {
      operation: "green_screen_processor" as const,
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exitCode,
      output_path: input.output,
      key_color: keyColor,
      similarity: input.similarity,
      blend: input.blend,
      alpha_quality: input.alpha_quality,
    };
  },
});

function normalizeColor(color: string): string {
  return color.startsWith("#") ? `0x${color.slice(1)}` : color;
}
