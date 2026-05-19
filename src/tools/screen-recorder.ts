import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { BRANDING } from "../branding.js";
import { defineTool } from "../registry/index.js";
import { errorWithInstallHint } from "../tool-support/errors.js";
import { resolveProjectPath } from "../tool-support/paths.js";

const INSTALL = "brew install ffmpeg";

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
        const message =
          process.platform === "darwin"
            ? `${stderr.trim() || error.message}\nmacOS requires Screen Recording permission for the terminal running ${BRANDING.primaryCli}.`
            : stderr.trim() || error.message;
        reject(errorWithInstallHint(new Error(message), INSTALL));
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
    install: INSTALL,
  },
  best_for: "generic local screen capture on macOS via avfoundation or Linux via x11grab",
  supports: ["macos-avfoundation", "linux-x11grab", "screen-recording"],
  input: inputSchema,
  output: outputSchema,
  async execute(params: ScreenRecorderInput, ctx): Promise<ScreenRecorderOutput> {
    const input = inputSchema.parse(params);
    const outputPath = resolveProjectPath(input.output_path, ctx.projectRoot);
    await mkdir(dirname(outputPath), { recursive: true });

    await runFile("ffmpeg", buildScreenRecorderArgs({ ...input, output_path: outputPath }));

    return outputSchema.parse({
      video_path: outputPath,
      duration_s: input.duration_s,
    });
  },
});

export default screenRecorder;
