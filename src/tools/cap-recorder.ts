import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/index.js";
import { errorWithInstallHint } from "../tool-support/errors.js";
import { resolveProjectPath } from "../tool-support/paths.js";

const INSTALL = "brew install cap-so/cap/cap";

const regionSchema = z.union([
  z.literal("screen"),
  z.object({
    x: z.number(),
    y: z.number(),
    w: z.number().positive(),
    h: z.number().positive(),
  }),
]);

const inputSchema = z.object({
  output_path: z.string().min(1),
  duration_s: z.number().positive().optional(),
  region: regionSchema.optional(),
});

const outputSchema = z.object({
  video_path: z.string().min(1),
  duration_s: z.number().nonnegative(),
  provider_metadata: z.record(z.string(), z.unknown()).default({}),
});

type CapRecorderInput = z.infer<typeof inputSchema>;
type CapRecorderOutput = z.infer<typeof outputSchema>;

export function buildCapRecorderArgs(input: CapRecorderInput): string[] {
  const args = ["record", "--output", input.output_path];

  if (input.duration_s !== undefined) {
    args.push("--duration", String(input.duration_s));
  }

  if (input.region !== undefined) {
    args.push("--region", formatRegion(input.region));
  }

  return args;
}

function formatRegion(region: z.infer<typeof regionSchema>): string {
  if (region === "screen") {
    return "screen";
  }

  return `${region.x},${region.y},${region.w},${region.h}`;
}

async function runFile(binary: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(binary, args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(errorWithInstallHint(new Error(stderr.trim() || error.message), INSTALL));
        return;
      }

      resolve({ stdout, stderr });
    });
  });
}

const capRecorder = defineTool({
  name: "cap_recorder",
  capability: "screen_capture",
  provider: "cap",
  status: "beta",
  integration: {
    kind: "cli",
    binary: "cap",
    auth: { mode: "none" },
    install: INSTALL,
  },
  best_for: "macOS Cap CLI recordings of fixture windows or full-screen capture",
  supports: ["macos-screen-recording", "fixture-window-capture", "region-capture"],
  input: inputSchema,
  output: outputSchema,
  async execute(params: CapRecorderInput, ctx): Promise<CapRecorderOutput> {
    const input = inputSchema.parse(params);
    const outputPath = resolveProjectPath(input.output_path, ctx.projectRoot);
    await mkdir(dirname(outputPath), { recursive: true });

    const startedAt = Date.now();
    const args = buildCapRecorderArgs({ ...input, output_path: outputPath });
    const result = await runFile("cap", args);
    const elapsedS = Math.max(0, (Date.now() - startedAt) / 1000);

    return outputSchema.parse({
      video_path: outputPath,
      duration_s: input.duration_s ?? elapsedS,
      provider_metadata: {
        binary: "cap",
        args,
        stderr: result.stderr.trim(),
      },
    });
  },
});

export default capRecorder;
