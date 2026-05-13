import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  output_path: z.string().min(1),
  duration_s: z.number().positive(),
  display: z.string().min(1).optional(),
});

const outputSchema = z.object({
  video_path: z.string().min(1),
  duration_s: z.number().nonnegative(),
});

type ScreenRecorderInput = z.infer<typeof inputSchema>;
type ScreenRecorderOutput = z.infer<typeof outputSchema>;

export function buildScreenRecorderArgs(input: ScreenRecorderInput, platform: NodeJS.Platform = process.platform): string[] {
  switch (platform) {
    case "darwin":
      return [
        "-hide_banner",
        "-y",
        "-f",
        "avfoundation",
        "-i",
        `${input.display ?? "1"}:none`,
        "-t",
        String(input.duration_s),
        input.output_path,
      ];
    case "linux":
      return [
        "-hide_banner",
        "-y",
        "-f",
        "x11grab",
        "-i",
        input.display ?? ":0.0",
        "-t",
        String(input.duration_s),
        input.output_path,
      ];
    default:
      throw new Error(`screen_recorder does not support platform: ${platform}`);
  }
}

async function runFile(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

const screenRecorder = defineTool({
  name: "screen_recorder",
  capability: "screen_capture",
  provider: "ffmpeg",
  status: "beta",
  integration: {
    kind: "binary",
    binary: "ffmpeg",
    install: "brew install ffmpeg",
  },
  best_for: "generic local screen capture on macOS via avfoundation or Linux via x11grab",
  supports: ["macos-avfoundation", "linux-x11grab", "screen-recording"],
  input: inputSchema,
  output: outputSchema,
  async execute(params: ScreenRecorderInput): Promise<ScreenRecorderOutput> {
    const input = inputSchema.parse(params);
    await mkdir(dirname(input.output_path), { recursive: true });

    await runFile("ffmpeg", buildScreenRecorderArgs(input));

    return outputSchema.parse({
      video_path: input.output_path,
      duration_s: input.duration_s,
    });
  },
});

export default screenRecorder;
