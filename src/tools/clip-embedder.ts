import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineTool } from "../registry/index.js";
import { errorWithInstallHint } from "../tool-support/errors.js";
import { resolveProjectReadPath } from "../tool-support/paths.js";

export const CLIP_MODEL_ID = "ViT-B-32/laion2b_s34b_b79k";
const INSTALL = "pip install open_clip_torch pillow; brew install ffmpeg for video-frame inputs";

const inputSchema = z
  .object({
    path: z.string().min(1).optional(),
    text: z.string().min(1).optional(),
    modality: z.enum(["image", "frame", "text"]).default("image"),
  })
  .superRefine((input, ctx) => {
    if (input.text === undefined && input.path === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "clip_embedder requires text or path",
      });
    }
    if (input.modality === "text" && input.text === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["text"],
        message: "text modality requires text",
      });
    }
    if (input.modality !== "text" && input.path === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["path"],
        message: "image/frame modality requires path",
      });
    }
  });

const outputSchema = z.object({
  dim: z.number().int().positive(),
  vector: z.array(z.number()),
  model_id: z.string(),
});

type ClipEmbedderInput = z.infer<typeof inputSchema>;
type ClipEmbedderOutput = z.infer<typeof outputSchema>;

const fallbackEmbedScript = String.raw`
import argparse
import json

MODEL_ID = "ViT-B-32/laion2b_s34b_b79k"

parser = argparse.ArgumentParser()
parser.add_argument("--path")
parser.add_argument("--text")
parser.add_argument("--modality", choices=["image", "frame", "text"], default="image")
args = parser.parse_args()

try:
    from PIL import Image
    import open_clip
    import torch
except Exception as exc:
    raise SystemExit(f"open_clip_torch and pillow are required: {exc}")

torch.manual_seed(0)
model, _, preprocess = open_clip.create_model_and_transforms("ViT-B-32", pretrained="laion2b_s34b_b79k")
tokenizer = open_clip.get_tokenizer("ViT-B-32")
model.eval()

with torch.no_grad():
    if args.modality == "text":
        if not args.text:
            raise SystemExit("--text is required for text modality")
        vector = model.encode_text(tokenizer([args.text]))
    else:
        if not args.path:
            raise SystemExit("--path is required for image/frame modality")
        image = preprocess(Image.open(args.path).convert("RGB")).unsqueeze(0)
        vector = model.encode_image(image)
    vector = vector / vector.norm(dim=-1, keepdim=True)

values = vector.squeeze(0).cpu().tolist()
print(json.dumps({"dim": len(values), "vector": values, "model_id": MODEL_ID}))
`;

export function parseClipEmbeddingJson(stdout: string): ClipEmbedderOutput {
  return outputSchema.parse(JSON.parse(stdout));
}

function embedArgs(input: { path?: string; text?: string; modality: "image" | "frame" | "text" }): string[] {
  const scriptPath = fileURLToPath(new URL("./clip-embedder/embed.py", import.meta.url));
  const args = existsSync(scriptPath) ? [scriptPath] : ["-c", fallbackEmbedScript];

  args.push("--modality", input.modality);

  if (input.path !== undefined) {
    args.push("--path", input.path);
  }
  if (input.text !== undefined) {
    args.push("--text", input.text);
  }

  return args;
}

async function preparedInput(input: ClipEmbedderInput): Promise<{
  argsInput: { path?: string; text?: string; modality: "image" | "frame" | "text" };
  cleanup?: () => Promise<void>;
}> {
  if (input.modality !== "frame" || input.path === undefined || !isVideoPath(input.path)) {
    return { argsInput: { path: input.path, text: input.text, modality: input.modality } };
  }

  const tempDir = await mkdtemp(join(tmpdir(), "show-sidekick-clip-frame-"));
  const framePath = join(tempDir, "midpoint.png");

  try {
    await extractMidpointFrame(input.path, framePath);
    return {
      argsInput: { path: framePath, modality: "frame" },
      cleanup: () => rm(tempDir, { recursive: true, force: true }),
    };
  } catch (error) {
    await rm(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function isVideoPath(path: string): boolean {
  return [".mp4", ".mov", ".mkv", ".webm"].includes(extname(path).toLowerCase());
}

async function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("python3", args, { maxBuffer: 20 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolve(stdout);
    });
  });
}

async function extractMidpointFrame(videoPath: string, outputPath: string): Promise<void> {
  const durationResult = await runFile("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    videoPath,
  ]);
  const duration = Number(durationResult.stdout.trim());
  const midpoint = Number.isFinite(duration) && duration > 0 ? duration / 2 : 0;

  await runFile("ffmpeg", ["-hide_banner", "-y", "-ss", String(midpoint), "-i", videoPath, "-frames:v", "1", outputPath]);
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

const clipEmbedder = defineTool({
  name: "clip_embedder",
  capability: "clip_embedding",
  provider: "open_clip",
  status: "experimental",
  integration: {
    kind: "binary",
    binary: "python3",
    install: INSTALL,
  },
  best_for: "deterministic CLIP embeddings for visual similarity search",
  supports: ["image-embedding", "frame-embedding", CLIP_MODEL_ID],
  input: inputSchema,
  output: outputSchema,
  async execute(params: ClipEmbedderInput, ctx): Promise<ClipEmbedderOutput> {
    const input = inputSchema.parse(params);
    const safeInput = input.path === undefined ? input : { ...input, path: resolveProjectReadPath(input.path, ctx.projectRoot) };
    let prepared: Awaited<ReturnType<typeof preparedInput>> | undefined;

    try {
      prepared = await preparedInput(safeInput);
      const stdout = await runPython(embedArgs(prepared.argsInput));

      return parseClipEmbeddingJson(stdout);
    } catch (error) {
      throw errorWithInstallHint(error, INSTALL);
    } finally {
      await prepared?.cleanup?.();
    }
  },
});

export default clipEmbedder;
