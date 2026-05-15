import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { isAbsolute, resolve } from "node:path";
import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import type { ToolContext } from "../registry/tool.js";
import { defaultRunCli } from "../tool-support/cli-runner.js";
import { lookupClipCache, rememberClipCache } from "../tool-support/clip-cache.js";

const HIGGSFIELD_COST_USD = 0.3;
const KLING_IMAGE_TO_VIDEO_URL = "https://api.higgsfield.ai/kling-video/v2.1/pro/image-to-video";
const MODEL = "kling-v2.1-pro";

const durationSchema = z.union([z.literal(5), z.literal(10)]);

const inputSchema = z
  .object({
    image_url: z.string().url().optional(),
    image_path: z.string().min(1).optional(),
    prompt: z.string().min(1),
    duration: durationSchema.default(5),
  })
  .superRefine((value, ctx) => {
    if (!value.image_url && !value.image_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["image_url"],
        message: "provide image_url or image_path",
      });
    }

    if (value.image_url && value.image_path) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["image_path"],
        message: "provide only one image source",
      });
    }
  });

const wireRequestSchema = z.object({
  url: z.string().url(),
  headers: z.record(z.string()),
  body: z
    .object({
      image_url: z.string().url(),
      prompt: z.string(),
      duration: durationSchema,
    })
    .strict(),
});

const outputSchema = z.object({
  video_path: z.string().min(1),
  cost_usd: z.number(),
  request: wireRequestSchema,
  cache_hit: z.boolean().optional(),
});

type HiggsfieldInput = z.infer<typeof inputSchema>;
type HiggsfieldOutput = z.infer<typeof outputSchema>;
type WireRequest = z.infer<typeof wireRequestSchema>;

export default defineTool({
  name: "higgsfield",
  capability: "image_to_video",
  provider: "higgsfield",
  status: "production",
  integration: {
    kind: "cli",
    binary: "higgsfield",
    auth: { mode: "cli-login", check: "higgsfield account status --json" },
    install: "npm i -g @higgsfield/cli && higgsfield auth login",
  },
  best_for: "Kling v2.1 Pro image-to-video through the Higgsfield CLI.",
  supports: ["kling-v2.1-pro", "image-to-video", "reference-image-animation"],
  cost: { unit: "clip", usd: HIGGSFIELD_COST_USD },
  agent_skills: ["higgsfield-generate", "ai-video-gen"],
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const imageSource = await prepareImageSource(input, ctx);
    const cacheKey = {
      prompt: input.prompt,
      provider: "higgsfield",
      model: MODEL,
      ...imageSource.cacheKey,
      duration: input.duration,
      aspect_ratio: "16:9",
    };
    const cached = await lookupClipCache(ctx, cacheKey);
    if (cached) {
      return outputSchema.parse({
        video_path: cached.video_path,
        cost_usd: 0,
        request: redactWireRequest(buildWireRequest(input, cached.resolved_image_url ?? imageSource.displayUrl)),
        cache_hit: true,
      } satisfies HiggsfieldOutput);
    }

    const imageUrl = await resolvePreparedImageUrl(imageSource, ctx);
    const request = buildWireRequest(input, imageUrl);
    const result = await runHiggsfield(input, imageUrl, request, ctx);
    const videoPath = readVideoPath(result.stdout);
    const recordedRequest = readRecordedRequest(result.stdout) ?? request;
    await rememberClipCache(ctx, { ...cacheKey, video_path: videoPath, resolved_image_url: imageUrl });

    return outputSchema.parse({
      video_path: videoPath,
      cost_usd: HIGGSFIELD_COST_USD,
      request: redactWireRequest(recordedRequest),
      cache_hit: false,
    } satisfies HiggsfieldOutput);
  },
});

type PreparedImageSource =
  | {
      kind: "url";
      displayUrl: string;
      cacheKey: { image_url: string };
    }
  | {
      kind: "path";
      imagePath: string;
      displayUrl: string;
      cacheKey: { image_fingerprint: string };
    };

async function prepareImageSource(input: HiggsfieldInput, ctx: ToolContext): Promise<PreparedImageSource> {
  if (input.image_url) {
    return {
      kind: "url",
      displayUrl: input.image_url,
      cacheKey: { image_url: input.image_url },
    };
  }

  if (!input.image_path) {
    throw new Error("Higgsfield requires image_url or image_path");
  }

  const imagePath = isAbsolute(input.image_path) ? input.image_path : resolve(ctx.projectRoot, input.image_path);
  const imageFingerprint = createHash("sha256").update(await readFile(imagePath)).digest("hex");

  return {
    kind: "path",
    imagePath,
    displayUrl: "https://cache.local/predit-local-image",
    cacheKey: { image_fingerprint: imageFingerprint },
  };
}

async function resolvePreparedImageUrl(input: PreparedImageSource, ctx: ToolContext): Promise<string> {
  if (input.kind === "url") {
    return input.displayUrl;
  }

  if (!ctx.registry) {
    throw new Error("Higgsfield image_path inputs require an image_hosting tool in the execution context");
  }

  const imageHostingTool = await ctx.registry.select("image_hosting");
  const hosted = await imageHostingTool.execute({ local_path: input.imagePath }, ctx);

  return readHostedUrl(hosted);
}

function buildWireRequest(input: HiggsfieldInput, imageUrl: string): WireRequest {
  return {
    url: KLING_IMAGE_TO_VIDEO_URL,
    headers: {
      Authorization: `Key ${nonBlankEnv("HIGGSFIELD_API_KEY") ?? "<key>"}:${nonBlankEnv("HIGGSFIELD_API_SECRET") ?? "<secret>"}`,
      "Content-Type": "application/json",
    },
    body: {
      image_url: imageUrl,
      prompt: input.prompt,
      duration: input.duration,
    },
  };
}

async function runHiggsfield(
  input: HiggsfieldInput,
  imageUrl: string,
  request: WireRequest,
  ctx: ToolContext,
): Promise<{ stdout: string; stderr: string }> {
  const runner = ctx.runCli ?? defaultRunCli;

  return runner(
    "higgsfield",
    [
      "generate",
      "kling-video",
      "v2.1",
      "pro",
      "image-to-video",
      "--image-url",
      imageUrl,
      "--prompt",
      input.prompt,
      "--duration",
      String(input.duration),
      "--json",
    ],
    {
      cwd: ctx.projectRoot,
      env: {
        ...process.env,
        HIGGSFIELD_RECORD_HTTP: "1",
      },
      input: JSON.stringify(request.body),
    },
  );
}

function readVideoPath(stdout: string): string {
  const parsed = parseJsonObject(stdout);
  const videoPath = parsed?.video_path ?? parsed?.path ?? parsed?.output_path;

  if (typeof videoPath !== "string" || videoPath.length === 0) {
    throw new Error("Higgsfield CLI did not return a video_path");
  }

  return videoPath;
}

function readRecordedRequest(stdout: string): WireRequest | undefined {
  const parsed = parseJsonObject(stdout);
  const request = parsed?.request;
  const result = wireRequestSchema.safeParse(request);

  return result.success ? result.data : undefined;
}

function redactWireRequest(request: WireRequest): WireRequest {
  const headers = { ...request.headers };
  for (const key of Object.keys(headers)) {
    if (key.toLowerCase() === "authorization") {
      headers[key] = redactAuthorization(headers[key] ?? "");
    }
  }

  return { ...request, headers };
}

function redactAuthorization(value: string): string {
  if (value.startsWith("Key ")) {
    return "Key <redacted>:<redacted>";
  }

  return value.length > 0 ? "<redacted>" : value;
}

function nonBlankEnv(name: string): string | undefined {
  const value = process.env[name];
  return value !== undefined && value.trim() !== "" ? value : undefined;
}

function readHostedUrl(output: unknown): string {
  if (isRecord(output) && typeof output.url === "string") {
    return output.url;
  }

  if (isRecord(output) && typeof output.image_url === "string") {
    return output.image_url;
  }

  throw new Error("image_hosting tool did not return a hosted url");
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
