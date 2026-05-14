import { z } from "zod";
import { defineTool } from "../registry/index.js";

const avatarVideoInputSchema = z.object({
  mode: z.literal("avatar_video"),
  avatar_id: z.string().min(1),
  voice_id: z.string().min(1),
  script: z.string().min(1),
});

const createVideoInputSchema = z.object({
  mode: z.literal("create_video"),
  avatar_id: z.string().min(1),
  voice_id: z.string().min(1),
  script: z.string().min(1),
  background: z.string().min(1).optional(),
});

const videoTranslateInputSchema = z.object({
  mode: z.literal("video_translate"),
  source_video_url: z.string().url(),
  target_language: z.string().min(1),
  voice_id: z.string().min(1).optional(),
});

const inputSchema = z.discriminatedUnion("mode", [
  avatarVideoInputSchema,
  createVideoInputSchema,
  videoTranslateInputSchema,
]);

const statusSchema = z.enum(["queued", "processing", "succeeded", "failed"]);

const outputSchema = z.object({
  video_id: z.string().min(1),
  video_url: z.string().url().optional(),
  status: statusSchema,
  duration_s: z.number().nonnegative().optional(),
});

type HeyGenVideoInput = z.infer<typeof inputSchema>;
type HeyGenVideoOutput = z.infer<typeof outputSchema>;

export function endpointForMode(mode: HeyGenVideoInput["mode"]): string {
  return mode === "video_translate"
    ? "https://api.heygen.com/v2/video_translate/create"
    : "https://api.heygen.com/v2/video/generate";
}

export function bodyForHeyGenMode(input: HeyGenVideoInput): Record<string, unknown> {
  if (input.mode === "video_translate") {
    return {
      video_url: input.source_video_url,
      output_language: input.target_language,
      ...(input.voice_id === undefined ? {} : { voice_id: input.voice_id }),
    };
  }

  return {
    video_inputs: [
      {
        character: {
          type: "avatar",
          avatar_id: input.avatar_id,
        },
        voice: {
          type: "text",
          voice_id: input.voice_id,
          input_text: input.script,
        },
        ...(input.mode === "create_video" && input.background !== undefined ? { background: input.background } : {}),
      },
    ],
  };
}

export function normalizeHeyGenOutput(responseJson: unknown): HeyGenVideoOutput {
  const root = isRecord(responseJson) ? responseJson : {};
  const data = isRecord(root.data) ? root.data : root;
  const videoId = stringValue(data.video_id) ?? stringValue(data.id);

  if (videoId === undefined) {
    throw new Error("HeyGen response did not include a video_id");
  }

  const videoUrl = stringValue(data.video_url) ?? stringValue(data.url);
  const durationS = numberValue(data.duration_s) ?? numberValue(data.duration);

  return outputSchema.parse({
    video_id: videoId,
    ...(videoUrl === undefined ? {} : { video_url: videoUrl }),
    status: normalizeStatus(stringValue(data.status)),
    ...(durationS === undefined ? {} : { duration_s: durationS }),
  });
}

function normalizeStatus(status: string | undefined): z.infer<typeof statusSchema> {
  if (status === "succeeded" || status === "success" || status === "completed" || status === "complete") {
    return "succeeded";
  }
  if (status === "failed" || status === "error") {
    return "failed";
  }
  if (status === "processing" || status === "running" || status === "in_progress") {
    return "processing";
  }

  return "queued";
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const heygenVideo = defineTool({
  name: "heygen_video",
  capability: "avatar_video",
  provider: "heygen",
  status: "beta",
  integration: {
    kind: "api",
    env: ["HEYGEN_API_KEY"],
    install: "export HEYGEN_API_KEY=...",
  },
  best_for: "HeyGen avatar-video, create-video, and video-translate workflows",
  supports: ["avatar_video", "create_video", "video_translate"],
  input: inputSchema,
  output: outputSchema,
  async execute(params: HeyGenVideoInput): Promise<HeyGenVideoOutput> {
    const input = inputSchema.parse(params);
    const apiKey = process.env.HEYGEN_API_KEY;

    if (apiKey === undefined || apiKey.trim() === "") {
      throw new Error("HEYGEN_API_KEY is required to execute heygen_video");
    }

    const response = await globalThis.fetch(endpointForMode(input.mode), {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(bodyForHeyGenMode(input)),
    });

    if (!response.ok) {
      throw new Error(`HeyGen request failed (${response.status}): ${await response.text()}`);
    }

    return normalizeHeyGenOutput(await response.json());
  },
});

export default heygenVideo;
