import { copyFile, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { z } from "zod";
import { generatedAssetPath } from "../media/generated-path.js";
import { runCommand } from "../media/process.js";
import { defineTool } from "../registry/index.js";

export const MathAnimateInputSchema = z.object({
  scene_source: z.string().min(1),
  scene_class: z.string().min(1),
  quality: z.enum(["l", "m", "h"]).default("l"),
  output_format: z.enum(["mp4", "png"]).default("mp4"),
});

export const MathAnimateOutputSchema = z.object({
  image_path: z.string(),
  format: z.enum(["mp4", "png"]),
  cost_usd: z.literal(0),
});

export default defineTool({
  name: "math_animate",
  capability: "image_generation",
  provider: "manim",
  status: "beta",
  integration: {
    kind: "binary",
    binary: "manim",
    install: "pip install manim; ensure ffmpeg and LaTeX are installed.",
  },
  best_for: "rendering Manim math scenes as animation clips or PNG frames",
  supports: ["math", "animation", "latex"],
  cost: { unit: "image", usd: 0 },
  agent_skills: ["manim-scenes"],
  input: MathAnimateInputSchema,
  output: MathAnimateOutputSchema,

  async execute(params, ctx) {
    const input = MathAnimateInputSchema.parse(params);
    const tempDir = await mkdtemp(join(tmpdir(), "predit-manim-"));
    const scenePath = join(tempDir, "scene.py");
    const outputName = `${input.scene_class}-${Date.now()}`;
    const outputPath = await generatedAssetPath(ctx, { extension: input.output_format });

    try {
      await writeFile(scenePath, input.scene_source, "utf8");
      await runCommand("manim", [`-q${input.quality}`, "--format", input.output_format, "-o", outputName, scenePath, input.scene_class], {
        cwd: tempDir,
      });
      const renderedPath = await findRenderedFile(join(tempDir, "media"), `${outputName}.${input.output_format}`);
      await copyFile(renderedPath, outputPath);
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }

    return MathAnimateOutputSchema.parse({ image_path: outputPath, format: input.output_format, cost_usd: 0 });
  },
});

async function findRenderedFile(root: string, targetName: string): Promise<string> {
  const entries = await readdir(root, { withFileTypes: true });

  for (const entry of entries) {
    const path = join(root, entry.name);
    if (entry.isDirectory()) {
      try {
        return await findRenderedFile(path, targetName);
      } catch (error) {
        if (!(error instanceof Error && error.message.startsWith("rendered file not found"))) {
          throw error;
        }
      }
      continue;
    }

    if (entry.isFile() && basename(path) === targetName) {
      return path;
    }
  }

  throw new Error(`rendered file not found: ${targetName}`);
}
