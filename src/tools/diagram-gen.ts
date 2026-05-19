import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { generatedAssetPath } from "../media/generated-path.js";
import { runCommand } from "../media/process.js";
import { defineTool } from "../registry/index.js";

export const DiagramGenInputSchema = z.object({
  source: z.string().min(1),
  format: z.enum(["png", "svg"]).default("png"),
  theme: z.string().default("default"),
  background: z.string().default("transparent"),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const DiagramGenOutputSchema = z.object({
  image_path: z.string(),
  format: z.enum(["png", "svg"]),
  cost_usd: z.literal(0),
});

export default defineTool({
  name: "diagram_gen",
  capability: "image_generation",
  provider: "mermaid",
  status: "beta",
  integration: {
    kind: "binary",
    binary: "mmdc",
    install: "pnpm dlx -p @mermaid-js/mermaid-cli mmdc --version, or npm i -g @mermaid-js/mermaid-cli.",
  },
  best_for: "rendering Mermaid diagrams to PNG or SVG visual assets",
  supports: ["mermaid", "png", "svg"],
  cost: { unit: "image", usd: 0 },
  input: DiagramGenInputSchema,
  output: DiagramGenOutputSchema,

  async execute(params, ctx) {
    const input = DiagramGenInputSchema.parse(params);
    const tempDir = await mkdtemp(join(tmpdir(), "show-sidekick-diagram-"));
    const sourcePath = join(tempDir, "diagram.mmd");
    const outputPath = await generatedAssetPath(ctx, { extension: input.format });
    const args = ["-i", sourcePath, "-o", outputPath, "-t", input.theme, "-b", input.background];

    if (input.width !== undefined) {
      args.push("-w", String(input.width));
    }
    if (input.height !== undefined) {
      args.push("-H", String(input.height));
    }

    try {
      await writeFile(sourcePath, input.source, "utf8");
      await runCommand("mmdc", args, { cwd: ctx.projectRoot });
    } finally {
      await rm(tempDir, { force: true, recursive: true });
    }

    return DiagramGenOutputSchema.parse({ image_path: outputPath, format: input.format, cost_usd: 0 });
  },
});
