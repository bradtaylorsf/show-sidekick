import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { defineTool } from "../registry/index.js";

const inputSchema = z.object({
  path: z.string().min(1),
  sample_every_n_frames: z.number().int().positive().default(1),
});

const faceSchema = z.object({
  x: z.number(),
  y: z.number(),
  w: z.number(),
  h: z.number(),
  score: z.number(),
});

const outputSchema = z.object({
  frames: z.array(
    z.object({
      time_s: z.number(),
      faces: z.array(faceSchema),
    }),
  ),
});

type FaceTrackerInput = z.infer<typeof inputSchema>;
type FaceTrackerOutput = z.infer<typeof outputSchema>;

const fallbackTrackerScript = String.raw`
import argparse
import json

parser = argparse.ArgumentParser()
parser.add_argument("--path", required=True)
parser.add_argument("--sample-every", type=int, default=1)
args = parser.parse_args()

try:
    import cv2
except Exception as exc:
    raise SystemExit(f"opencv-python is required: {exc}")

cap = cv2.VideoCapture(args.path)
fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
frames = []
frame_index = 0
sample_every = max(1, args.sample_every)

while True:
    ok, frame = cap.read()
    if not ok:
        break
    if frame_index % sample_every == 0:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        detections = cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
        faces = [
            {"x": float(x), "y": float(y), "w": float(w), "h": float(h), "score": 1.0}
            for (x, y, w, h) in detections
        ]
        frames.append({"time_s": frame_index / fps, "faces": faces})
    frame_index += 1

cap.release()
print(json.dumps({"frames": frames}))
`;

export function parseFaceTrackerJson(stdout: string): FaceTrackerOutput {
  return outputSchema.parse(JSON.parse(stdout));
}

function trackerArgs(input: FaceTrackerInput): string[] {
  const scriptPath = fileURLToPath(new URL("./face-tracker/track.py", import.meta.url));

  if (existsSync(scriptPath)) {
    return [scriptPath, "--path", input.path, "--sample-every", String(input.sample_every_n_frames)];
  }

  return ["-c", fallbackTrackerScript, "--path", input.path, "--sample-every", String(input.sample_every_n_frames)];
}

async function runPython(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("python3", args, { maxBuffer: 10 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr.trim() || error.message));
        return;
      }

      resolve(stdout);
    });
  });
}

const faceTracker = defineTool({
  name: "face_tracker",
  capability: "face_tracking",
  provider: "opencv",
  status: "experimental",
  integration: {
    kind: "binary",
    binary: "python3",
    install: "pip install opencv-python",
  },
  best_for: "sampled face bounding boxes for auto-reframe planning",
  supports: ["opencv-haarcascade", "face-bounding-boxes"],
  input: inputSchema,
  output: outputSchema,
  async execute(params: FaceTrackerInput): Promise<FaceTrackerOutput> {
    const input = inputSchema.parse(params);
    const stdout = await runPython(trackerArgs(input));

    return parseFaceTrackerJson(stdout);
  },
});

export default faceTracker;
