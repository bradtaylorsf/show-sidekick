import { z } from "zod";
import { runFfmpeg } from "../media/ffmpeg-runner.js";
import { defineTool } from "../registry/index.js";

const INSTALL_INSTRUCTIONS = `macOS: brew install ffmpeg
Linux: sudo apt-get update && sudo apt-get install ffmpeg
Windows: winget install Gyan.FFmpeg`;

export const GreenScreenCompositeInputSchema = z.object({
  foreground: z.string(),
  background: z.string(),
  output: z.string(),
  key_color: z.string().default("0x00FF00"),
  similarity: z.number().min(0).max(1).default(0.3),
  blend: z.number().min(0).max(1).default(0.1),
});

export const GreenScreenCompositeOutputSchema = z.object({
  operation: z.literal("green_screen_composite"),
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number().int(),
  output_path: z.string(),
  key_color: z.string(),
  similarity: z.number(),
  blend: z.number(),
});

export type GreenScreenCompositeInput = z.infer<typeof GreenScreenCompositeInputSchema>;
export type GreenScreenCompositeOutput = z.infer<typeof GreenScreenCompositeOutputSchema>;

export default defineTool({
  name: "green_screen_composite",
  capability: "video_compose",
  provider: "ffmpeg",
  status: "production",
  integration: {
    kind: "binary",
    binary: "ffmpeg",
    install: INSTALL_INSTRUCTIONS,
  },
  best_for: "replacing green-screen video backgrounds with local generated or stock backdrops",
  supports: ["chromakey", "background-composite"],
  input: GreenScreenCompositeInputSchema,
  output: GreenScreenCompositeOutputSchema,

  async execute(params) {
    const input = GreenScreenCompositeInputSchema.parse(params);
    const keyColor = normalizeColor(input.key_color);
    const filter = `[0:v]format=rgba,chromakey=${keyColor}:${input.similarity}:${input.blend}[fg];[1:v][fg]overlay=shortest=1:format=auto[vout]`;
    const command = [
      "ffmpeg",
      "-y",
      "-hide_banner",
      "-i",
      input.foreground,
      "-stream_loop",
      "-1",
      "-i",
      input.background,
      "-filter_complex",
      filter,
      "-map",
      "[vout]",
      "-an",
      "-c:v",
      "libx264",
      "-preset",
      "ultrafast",
      "-pix_fmt",
      "yuv420p",
      "-shortest",
      input.output,
    ];
    const result = await runFfmpeg(command);

    return {
      operation: "green_screen_composite" as const,
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exitCode,
      output_path: input.output,
      key_color: keyColor,
      similarity: input.similarity,
      blend: input.blend,
    };
  },
});

function normalizeColor(color: string): string {
  return color.startsWith("#") ? `0x${color.slice(1)}` : color;
}
