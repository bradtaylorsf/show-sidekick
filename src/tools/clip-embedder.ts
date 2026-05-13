import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineTool } from "../registry/index.js";

export const CLIP_MODEL_ID = "ViT-B-32/laion2b_s34b_b79k";

const inputSchema = z.object({
  path: z.string().min(1),
  modality: z.enum(["image", "frame"]).default("image"),
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
parser.add_argument("--path", required=True)
parser.add_argument("--modality", choices=["image", "frame"], default="image")
args = parser.parse_args()

try:
    from PIL import Image
    import open_clip
    import torch
except Exception as exc:
    raise SystemExit(f"open_clip_torch and pillow are required: {exc}")

torch.manual_seed(0)
model, _, preprocess = open_clip.create_model_and_transforms("ViT-B-32", pretrained="laion2b_s34b_b79k")
model.eval()
image = preprocess(Image.open(args.path).convert("RGB")).unsqueeze(0)

with torch.no_grad():
    vector = model.encode_image(image)
    vector = vector / vector.norm(dim=-1, keepdim=True)

values = vector.squeeze(0).cpu().tolist()
print(json.dumps({"dim": len(values), "vector": values, "model_id": MODEL_ID}))
`;

export function parseClipEmbeddingJson(stdout: string): ClipEmbedderOutput {
  return outputSchema.parse(JSON.parse(stdout));
}

function embedArgs(input: ClipEmbedderInput): string[] {
  const scriptPath = fileURLToPath(new URL("./clip-embedder/embed.py", import.meta.url));

  if (existsSync(scriptPath)) {
    return [scriptPath, "--path", input.path, "--modality", input.modality];
  }

  return ["-c", fallbackEmbedScript, "--path", input.path, "--modality", input.modality];
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

const clipEmbedder = defineTool({
  name: "clip_embedder",
  capability: "clip_embedding",
  provider: "open_clip",
  status: "experimental",
  integration: {
    kind: "binary",
    binary: "python3",
    install: "pip install open_clip_torch pillow",
  },
  best_for: "deterministic CLIP embeddings for visual similarity search",
  supports: ["image-embedding", "frame-embedding", CLIP_MODEL_ID],
  input: inputSchema,
  output: outputSchema,
  async execute(params: ClipEmbedderInput): Promise<ClipEmbedderOutput> {
    const input = inputSchema.parse(params);
    const stdout = await runPython(embedArgs(input));

    return parseClipEmbeddingJson(stdout);
  },
});

export default clipEmbedder;
