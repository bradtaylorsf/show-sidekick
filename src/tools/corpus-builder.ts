import { execFile } from "node:child_process";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/index.js";
import type { ToolContext } from "../registry/index.js";
import clipEmbedder from "./clip-embedder.js";

const defaultGlob = "**/*.{png,jpg,jpeg,mp4,mov}";
const videoExtensions = new Set([".mp4", ".mov"]);

const inputSchema = z.object({
  dir: z.string().min(1),
  glob: z.string().default(defaultGlob),
  output_path: z.string().min(1),
});

const corpusItemSchema = z.object({
  path: z.string(),
  vector: z.array(z.number()),
});

const corpusIndexSchema = z.object({
  model_id: z.string(),
  items: z.array(corpusItemSchema),
});

const outputSchema = z.object({
  index_path: z.string(),
  count: z.number().int().min(0),
  model_id: z.string(),
});

type CorpusBuilderInput = z.infer<typeof inputSchema>;
type CorpusIndex = z.infer<typeof corpusIndexSchema>;
type Embedding = { vector: number[]; model_id: string };

export function extensionsFromGlob(glob: string): Set<string> {
  const brace = /\{([^}]+)\}/.exec(glob);
  if (brace) {
    return new Set(
      brace[1]
        .split(",")
        .map((extension) => extension.trim().toLowerCase())
        .filter(Boolean)
        .map((extension) => (extension.startsWith(".") ? extension : `.${extension}`)),
    );
  }

  const extension = extname(glob).toLowerCase();
  return extension ? new Set([extension]) : new Set();
}

export function isVideoPath(path: string): boolean {
  return videoExtensions.has(extname(path).toLowerCase());
}

export async function enumerateCorpusFiles(root: string, glob = defaultGlob): Promise<string[]> {
  const extensions = extensionsFromGlob(glob);
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const path = join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(path);
        continue;
      }

      if (entry.isFile() && (extensions.size === 0 || extensions.has(extname(entry.name).toLowerCase()))) {
        files.push(path);
      }
    }
  }

  await walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

export async function buildCorpusIndex(files: string[], embedFile: (path: string) => Promise<Embedding>): Promise<CorpusIndex> {
  const items: CorpusIndex["items"] = [];
  let modelId = "unknown";

  for (const file of files) {
    const embedding = await embedFile(file);
    modelId = modelId === "unknown" ? embedding.model_id : modelId;
    items.push({ path: file, vector: embedding.vector });
  }

  return corpusIndexSchema.parse({ model_id: modelId, items });
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

async function probeDuration(path: string): Promise<number> {
  const result = await runFile("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    path,
  ]);
  const duration = Number(result.stdout.trim());
  return Number.isFinite(duration) ? duration : 0;
}

async function sampleMidpointFrame(path: string, outputDir: string): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const duration = await probeDuration(path);
  const time = Math.max(0, duration / 2);
  const outputPath = join(outputDir, `${basename(path, extname(path))}-midpoint.png`);

  await runFile("ffmpeg", ["-hide_banner", "-y", "-ss", String(time), "-i", path, "-frames:v", "1", outputPath]);
  return outputPath;
}

const corpusBuilder = defineTool({
  name: "corpus_builder",
  capability: "corpus_index",
  provider: "predit",
  status: "beta",
  integration: {
    kind: "library",
    package: "predit",
    install: "pnpm add predit",
  },
  best_for: "indexing local clip and image directories for visual similarity search",
  supports: ["image-index", "video-midpoint-frame-index", "clip-search"],
  input: inputSchema,
  output: outputSchema,
  isAvailable: async () => ({ available: true }),
  async execute(params: CorpusBuilderInput, ctx: ToolContext) {
    const input = inputSchema.parse(params);
    const files = await enumerateCorpusFiles(input.dir, input.glob);
    const frameDir = join(dirname(input.output_path), ".predit-corpus-frames");

    const index = await buildCorpusIndex(files, async (file) => {
      const embeddingPath = isVideoPath(file) ? await sampleMidpointFrame(file, frameDir) : file;
      const modality = isVideoPath(file) ? "frame" : "image";

      // Keep corpus indexing parallel-safe with runtime work by calling the local tool module directly.
      return clipEmbedder.execute({ path: embeddingPath, modality }, ctx);
    });

    await mkdir(dirname(input.output_path), { recursive: true });
    await writeFile(input.output_path, `${JSON.stringify(index, null, 2)}\n`, "utf8");

    return outputSchema.parse({
      index_path: input.output_path,
      count: index.items.length,
      model_id: index.model_id,
    });
  },
});

export default corpusBuilder;
