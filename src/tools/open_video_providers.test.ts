import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../registry/tool.js";
import cogvideoVideo from "./cogvideo_video.js";
import grokVideo from "./grok_video.js";
import hunyuanVideo from "./hunyuan_video.js";
import ltxVideoLocal from "./ltx_video_local.js";
import ltxVideoModal from "./ltx_video_modal.js";
import wanVideo from "./wan_video.js";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual<typeof import("node:child_process")>("node:child_process");
  return { ...actual, execFile: vi.fn() };
});

function noopLogger(): ToolContext["logger"] {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return { projectRoot: "/project", logger: noopLogger(), execution: { mode: "non_interactive" }, ...overrides };
}

type FetchCall = [string, { method?: string; headers?: Record<string, string>; body?: string }];

const providers = [
  {
    tool: hunyuanVideo,
    name: "hunyuan_video",
    capability: "image_to_video",
    provider: "replicate",
    env: ["REPLICATE_API_TOKEN"],
    cost: { unit: "clip", usd: 0.5 },
    skills: ["ai-video-gen", "hunyuan"],
    url: "https://api.replicate.com/v1/predictions",
    model: "tencent/hunyuan-video",
  },
  {
    tool: wanVideo,
    name: "wan_video",
    capability: "image_to_video",
    provider: "replicate",
    env: ["REPLICATE_API_TOKEN"],
    cost: { unit: "clip", usd: 0.5 },
    skills: ["ai-video-gen", "wan"],
    url: "https://api.replicate.com/v1/predictions",
    model: "wan-ai/wan-2.1",
  },
  {
    tool: cogvideoVideo,
    name: "cogvideo_video",
    capability: "image_to_video",
    provider: "replicate",
    env: ["REPLICATE_API_TOKEN"],
    cost: { unit: "clip", usd: 0.5 },
    skills: ["ai-video-gen", "cogvideo"],
    url: "https://api.replicate.com/v1/predictions",
    model: "THUDM/cogvideox-5b",
  },
  {
    tool: ltxVideoModal,
    name: "ltx_video_modal",
    capability: "image_to_video",
    provider: "modal",
    env: ["MODAL_TOKEN_ID", "MODAL_TOKEN_SECRET", "MODAL_LTX_URL"],
    cost: { unit: "clip", usd: 0.15 },
    skills: ["ai-video-gen", "ltx"],
    url: "https://modal.example.com/ltx",
    model: undefined,
  },
  {
    tool: grokVideo,
    name: "grok_video",
    capability: "text_to_video",
    provider: "xai",
    env: ["XAI_API_KEY"],
    cost: { unit: "clip", usd: 0.5 },
    skills: ["ai-video-gen", "grok"],
    url: "https://api.x.ai/v1/video/generations",
    model: "grok-video-1",
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("open video provider tools", () => {
  it("declares metadata, auth integration, costs, and Layer 3 skills", () => {
    for (const spec of providers) {
      expect(spec.tool).toMatchObject({
        name: spec.name,
        capability: spec.capability,
        provider: spec.provider,
        status: "experimental",
        integration: { kind: "api", env: spec.env },
        cost: spec.cost,
        agent_skills: spec.skills,
      });
    }

    expect(ltxVideoLocal).toMatchObject({
      name: "ltx_video_local",
      capability: "image_to_video",
      provider: "ltx",
      status: "experimental",
      integration: { kind: "binary", binary: "ltx-video" },
      cost: { unit: "clip", usd: 0 },
      agent_skills: ["ai-video-gen", "ltx"],
    });
  });

  it("validates common API provider input shape", () => {
    for (const spec of providers) {
      expect(spec.tool.input.parse({ prompt: "fixture camera move", duration: 5, aspect_ratio: "16:9" })).toMatchObject({
        prompt: "fixture camera move",
        duration: 5,
        aspect_ratio: "16:9",
      });

      expect(() => spec.tool.input.parse({ prompt: "" })).toThrow();
      expect(() => spec.tool.input.parse({ prompt: "fixture", image_url: "not-a-url" })).toThrow();
    }

    expect(ltxVideoLocal.input.parse({ prompt: "local ltx", image_path: "fixtures/ref.png" })).toMatchObject({
      prompt: "local ltx",
      image_path: "fixtures/ref.png",
    });
  });

  it("posts each API provider's documented request shape and returns tracked default cost", async () => {
    vi.stubEnv("MODAL_LTX_URL", "https://modal.example.com/ltx");
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "provider-request-1", video_path: "projects/show/episode/clips/out.mp4" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    for (const spec of providers) {
      fetchMock.mockClear();
      const params =
        spec.name === "grok_video"
          ? { prompt: "fixture camera move", duration: 5 }
          : { prompt: "fixture camera move", image_url: "https://cdn.example.com/ref.png", duration: 5 };

      const result = await spec.tool.execute(spec.tool.input.parse(params), context());
      const [url, options] = fetchMock.mock.calls[0] as FetchCall;
      const body = JSON.parse(options.body ?? "{}") as Record<string, unknown>;

      expect(url).toBe(spec.url);
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual(expect.objectContaining({ "Content-Type": "application/json" }));
      expect(JSON.stringify(body)).toContain("fixture camera move");
      expect(result).toEqual({
        video_path: "projects/show/episode/clips/out.mp4",
        cost_usd: spec.cost.usd,
        provider_request_id: "provider-request-1",
      });

      if (spec.name === "ltx_video_modal") {
        expect(options.headers).toEqual(
          expect.objectContaining({
            "Modal-Key": "<MODAL_TOKEN_ID>",
            "Modal-Secret": "<MODAL_TOKEN_SECRET>",
          }),
        );
        expect(body).toMatchObject({
          prompt: "fixture camera move",
          image_url: "https://cdn.example.com/ref.png",
          duration: 5,
          aspect_ratio: "16:9",
        });
      } else if (spec.name === "grok_video") {
        expect(options.headers?.Authorization).toBe("Bearer <XAI_API_KEY>");
        expect(body).toMatchObject({
          model: "grok-video-1",
          prompt: "fixture camera move",
          duration: 5,
          aspect_ratio: "16:9",
        });
      } else {
        expect(options.headers).toEqual(expect.objectContaining({ Authorization: "Bearer <REPLICATE_API_TOKEN>", Prefer: "wait" }));
        expect(body).toMatchObject({
          model: spec.model,
          input: {
            prompt: "fixture camera move",
            image: "https://cdn.example.com/ref.png",
            duration: 5,
            aspect_ratio: "16:9",
          },
        });
      }
    }
  });

  it("surfaces non-2xx provider responses with the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad request", { status: 400 })),
    );

    await expect(
      hunyuanVideo.execute(hunyuanVideo.input.parse({ prompt: "fixture", image_url: "https://cdn.example.com/ref.png" }), context()),
    ).rejects.toThrow("hunyuan video request failed (400): bad request");
  });

  it("runs local LTX through the CLI with resolved image and output paths", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-ltx-"));
    const runCli = vi.fn(async () => ({
      stdout: JSON.stringify({ video_path: join(projectRoot, "clips", "ltx.mp4") }),
      stderr: "",
    }));

    const result = await ltxVideoLocal.execute(
      ltxVideoLocal.input.parse({
        prompt: "local fixture movement",
        image_path: "fixtures/ref.png",
        duration: 4,
        aspect_ratio: "9:16",
        output_path: "clips/ltx.mp4",
      }),
      context({ projectRoot, runCli }),
    );

    expect(runCli).toHaveBeenCalledWith(
      "ltx-video",
      [
        "--prompt",
        "local fixture movement",
        "--image",
        join(projectRoot, "fixtures", "ref.png"),
        "--duration",
        "4",
        "--aspect-ratio",
        "9:16",
        "--out",
        join(projectRoot, "clips", "ltx.mp4"),
        "--json",
      ],
      { cwd: projectRoot },
    );
    expect(result).toEqual({ video_path: join(projectRoot, "clips", "ltx.mp4"), cost_usd: 0 });
  });

  it("marks local LTX unavailable when the binary exists but no GPU is detected", async () => {
    const execFileMock = vi.mocked(execFile);
    execFileMock.mockImplementation((...args: unknown[]) => {
      const command = args[0];
      const callback = args.find((arg): arg is (error: Error | null, stdout: string, stderr: string) => void => {
        return typeof arg === "function";
      });
      const child = new EventEmitter() as EventEmitter & { kill: () => void };
      child.kill = vi.fn();

      queueMicrotask(() => {
        if (command === "which") {
          callback?.(null, "/usr/local/bin/ltx-video\n", "");
          child.emit("exit", 0);
          return;
        }

        callback?.(new Error("nvidia-smi missing"), "", "nvidia-smi missing");
        child.emit("exit", 1);
      });

      return child as ReturnType<typeof execFile>;
    });

    await expect(ltxVideoLocal.isAvailable()).resolves.toEqual({
      available: false,
      reason: "no local GPU detected",
      fix: "install",
    });
  });
});
