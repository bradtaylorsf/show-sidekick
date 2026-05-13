import { execFile } from "node:child_process";
import { z } from "zod";
import { runFfmpeg } from "../media/ffmpeg-runner.js";
import { defineTool } from "../registry/index.js";

const INSTALL_INSTRUCTIONS = `macOS: brew install ffmpeg
Linux: sudo apt-get update && sudo apt-get install ffmpeg
Windows: winget install Gyan.FFmpeg`;

const ImageLayerSchema = z.object({
  path: z.string(),
  x: z.number(),
  y: z.number(),
  width: z.number().positive().optional(),
  height: z.number().positive().optional(),
});

export const ShowcaseCardInputSchema = z.object({
  output: z.string(),
  canvas: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    background_color: z.string().default("0x111111"),
  }),
  logo: ImageLayerSchema.optional(),
  headline: z.object({
    text: z.string().min(1),
    font_path: z.string().optional(),
    font_size: z.number().int().positive(),
    color: z.string(),
    x: z.number(),
    y: z.number(),
    max_width: z.number().positive().optional(),
  }),
  product_shot: ImageLayerSchema.optional(),
});

export const ShowcaseCardOutputSchema = z.object({
  operation: z.literal("showcase_card"),
  stdout: z.string(),
  stderr: z.string(),
  exit_code: z.number().int(),
  output_path: z.string(),
});

export type ShowcaseCardInput = z.infer<typeof ShowcaseCardInputSchema>;
export type ShowcaseCardOutput = z.infer<typeof ShowcaseCardOutputSchema>;

type Layer = NonNullable<ShowcaseCardInput["logo"]>;

export default defineTool({
  name: "showcase_card",
  capability: "image_generation",
  provider: "ffmpeg",
  status: "production",
  integration: {
    kind: "binary",
    binary: "ffmpeg",
    install: INSTALL_INSTRUCTIONS,
  },
  best_for: "deterministic product or brand showcase cards composed from local assets",
  supports: ["logo-overlay", "headline", "product-shot"],
  input: ShowcaseCardInputSchema,
  output: ShowcaseCardOutputSchema,
  async isAvailable() {
    if (!(await hasBinary("ffmpeg"))) {
      return { available: false, reason: "binary not on PATH: ffmpeg", fix: "install" };
    }

    if (!(await hasFilter("drawtext"))) {
      return { available: false, reason: "ffmpeg filter unavailable: drawtext", fix: "install" };
    }

    return { available: true };
  },

  async execute(params) {
    const input = ShowcaseCardInputSchema.parse(params);
    const layers = [input.logo, input.product_shot].filter((layer): layer is Layer => layer !== undefined);
    const { filter, outputLabel } = filterGraph(input, layers);
    const command = [
      "ffmpeg",
      "-y",
      "-hide_banner",
      "-f",
      "lavfi",
      "-i",
      `color=c=${normalizeColor(input.canvas.background_color)}:s=${input.canvas.width}x${input.canvas.height}:d=1`,
      ...layers.flatMap((layer) => ["-i", layer.path]),
      "-filter_complex",
      filter,
      "-map",
      outputLabel,
      "-frames:v",
      "1",
      input.output,
    ];
    const result = await runFfmpeg(command);

    return {
      operation: "showcase_card" as const,
      stdout: result.stdout,
      stderr: result.stderr,
      exit_code: result.exitCode,
      output_path: input.output,
    };
  },
});

function filterGraph(params: ShowcaseCardInput, layers: Layer[]): { filter: string; outputLabel: string } {
  const filters: string[] = [];
  let current = "base";
  filters.push(`[0:v]format=rgba[${current}]`);

  layers.forEach((layer, layerIndex) => {
    const inputIndex = layerIndex + 1;
    const scaled = `layer${layerIndex}`;
    const withLayer = `with_layer${layerIndex}`;
    filters.push(`[${inputIndex}:v]${scaleFilter(layer)},format=rgba[${scaled}]`);
    filters.push(`[${current}][${scaled}]overlay=${layer.x}:${layer.y}[${withLayer}]`);
    current = withLayer;
  });

  const headline = params.headline;
  const text = escapeDrawtextText(wrapText(headline.text, headline.font_size, headline.max_width));
  const font = headline.font_path ? `:fontfile='${escapeDrawtextText(headline.font_path)}'` : "";
  const textOut = "textout";
  filters.push(
    `[${current}]drawtext=text='${text}'${font}:fontcolor=${normalizeColor(headline.color)}:fontsize=${headline.font_size}:x=${headline.x}:y=${headline.y}:line_spacing=${Math.round(
      headline.font_size * 0.2,
    )}[${textOut}]`,
  );

  return { filter: filters.join(";"), outputLabel: `[${textOut}]` };
}

function scaleFilter(layer: Layer): string {
  if (layer.width && layer.height) {
    return `scale=${layer.width}:${layer.height}`;
  }

  if (layer.width) {
    return `scale=${layer.width}:-1`;
  }

  if (layer.height) {
    return `scale=-1:${layer.height}`;
  }

  return "null";
}

function wrapText(text: string, fontSize: number, maxWidth: number | undefined): string {
  if (!maxWidth) {
    return text;
  }

  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * 0.55)));
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines.join("\n");
}

function normalizeColor(color: string): string {
  return color.startsWith("#") ? `0x${color.slice(1)}` : color;
}

function escapeDrawtextText(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll(":", "\\:").replaceAll("'", "\\'").replaceAll("\n", "\\n");
}

function hasBinary(binary: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("which", [binary], (error) => resolve(error === null));
  });
}

function hasFilter(filterName: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile("ffmpeg", ["-hide_banner", "-filters"], { maxBuffer: 10 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        resolve(false);
        return;
      }

      resolve(stdout.includes(` ${filterName} `));
    });
  });
}
