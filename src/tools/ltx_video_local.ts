import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import { probe } from "../registry/availability.js";
import { defineTool } from "../registry/define-tool.js";
import type { Availability, ToolCommandRunner } from "../registry/tool.js";
import { videoProviderOutputSchema } from "../tool-support/video-provider.js";

const integration = {
  kind: "binary",
  binary: "ltx-video",
  install: "pip install ltx-video and ensure CUDA GPU available",
} as const;

const inputSchema = z.object({
  prompt: z.string().min(1),
  image_path: z.string().min(1).optional(),
  duration: z.number().int().positive().optional(),
  aspect_ratio: z.string().min(1).optional(),
  output_path: z.string().min(1).optional(),
});

export default defineTool({
  name: "ltx_video_local",
  capability: "image_to_video",
  provider: "ltx",
  status: "experimental",
  integration,
  best_for: "Local LTX video generation on a CUDA GPU with no per-clip provider charge.",
  supports: ["ltx-video", "local-gpu", "image-to-video", "text-to-video"],
  cost: { unit: "clip", usd: 0 },
  agent_skills: ["ai-video-gen", "ltx"],
  input: inputSchema,
  output: videoProviderOutputSchema,
  async isAvailable(): Promise<Availability> {
    const binary = await probe(integration);

    if (!binary.available) {
      return binary;
    }

    if (await hasLocalGpu()) {
      return { available: true };
    }

    return { available: false, reason: "no local GPU detected", fix: "install" };
  },
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const outputPath = resolveOutputPath(input.output_path, ctx.projectRoot);
    await mkdir(dirname(outputPath), { recursive: true });

    const args = [
      "--prompt",
      input.prompt,
      ...imageArgs(input.image_path, ctx.projectRoot),
      "--duration",
      String(input.duration ?? 5),
      "--aspect-ratio",
      input.aspect_ratio ?? "16:9",
      "--out",
      outputPath,
      "--json",
    ];
    const runner = ctx.runCli ?? defaultRunCli;
    const result = await runner("ltx-video", args, { cwd: ctx.projectRoot });
    const videoPath = readVideoPath(result.stdout);

    return videoProviderOutputSchema.parse({
      video_path: videoPath,
      cost_usd: 0,
    });
  },
});

function imageArgs(imagePath: string | undefined, projectRoot: string): string[] {
  if (!imagePath) {
    return [];
  }

  const resolved = isAbsolute(imagePath) ? imagePath : resolve(projectRoot, imagePath);
  return ["--image", resolved];
}

function resolveOutputPath(outputPath: string | undefined, projectRoot: string): string {
  if (!outputPath) {
    return join(projectRoot, "projects", "_tool_runs", "video", `ltx-video-${Date.now().toString()}.mp4`);
  }

  return isAbsolute(outputPath) ? outputPath : resolve(projectRoot, outputPath);
}

function hasLocalGpu(): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const child = execFile("nvidia-smi", ["-L"], { encoding: "utf8" }, (error, stdout) => {
      resolvePromise(error === null && stdout.trim().length > 0);
    });
    const timeout = setTimeout(() => {
      child.kill();
      resolvePromise(false);
    }, 3_000);

    child.once("exit", () => clearTimeout(timeout));
  });
}

const defaultRunCli: ToolCommandRunner = (command, args, options = {}) => {
  return new Promise((resolvePromise, reject) => {
    const child = execFile(
      command,
      args,
      {
        cwd: options.cwd,
        env: options.env,
        encoding: "utf8",
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${command} failed: ${stderr || error.message}`));
          return;
        }

        resolvePromise({ stdout, stderr });
      },
    );

    if (options.input !== undefined) {
      child.stdin?.end(options.input);
    }
  });
};

function readVideoPath(stdout: string): string {
  const parsed = parseJsonObject(stdout);
  const videoPath = parsed?.video_path ?? parsed?.path ?? parsed?.output_path;

  if (typeof videoPath !== "string" || videoPath.length === 0) {
    throw new Error("ltx-video CLI did not return a video_path");
  }

  return videoPath;
}

function parseJsonObject(stdout: string): Record<string, unknown> | undefined {
  try {
    const parsed: unknown = JSON.parse(stdout);
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
