import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../registry/tool.js";
import klingVideo from "./kling_video.js";
import minimaxVideo from "./minimax_video.js";
import runwayVideo from "./runway_video.js";
import seedanceReplicate from "./seedance_replicate.js";
import seedanceVideo from "./seedance_video.js";
import veoVideo from "./veo_video.js";

function noopLogger(): ToolContext["logger"] {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

function context(projectRoot = "/project"): ToolContext {
  return { projectRoot, logger: noopLogger(), execution: { mode: "non_interactive" } };
}

type FetchCall = [string, { method?: string; headers?: Record<string, string>; body?: string }];

const providers = [
  {
    tool: klingVideo,
    name: "kling_video",
    capability: "image_to_video",
    provider: "kling",
    env: ["KLING_ACCESS_KEY", "KLING_SECRET_KEY"],
    cost: { unit: "clip", usd: 0.3 },
    skills: ["ai-video-gen", "kling"],
    url: "https://api.klingai.com/kling-video/v2.1/pro/image-to-video",
    authPrefix: "Key ",
  },
  {
    tool: seedanceReplicate,
    name: "seedance_replicate",
    capability: "image_to_video",
    provider: "replicate",
    env: ["REPLICATE_API_TOKEN"],
    cost: { unit: "second", usd: 0.05 },
    skills: ["ai-video-gen", "seedance-2-0"],
    url: "https://api.replicate.com/v1/predictions",
    authPrefix: "Bearer ",
  },
  {
    tool: seedanceVideo,
    name: "seedance_video",
    capability: "image_to_video",
    provider: "bytedance",
    env: ["BYTEDANCE_API_KEY"],
    cost: { unit: "clip", usd: 0.4 },
    skills: ["ai-video-gen", "seedance-2-0"],
    url: "https://api.bytedance.com/video/seedance/v1/image-to-video",
    authPrefix: "Bearer ",
  },
  {
    tool: runwayVideo,
    name: "runway_video",
    capability: "image_to_video",
    provider: "runway",
    env: ["RUNWAY_API_KEY"],
    cost: { unit: "second", usd: 0.05 },
    skills: ["ai-video-gen", "runway"],
    url: "https://api.runwayml.com/v1/image_to_video",
    authPrefix: "Bearer ",
  },
  {
    tool: veoVideo,
    name: "veo_video",
    capability: "text_to_video",
    provider: "google",
    env: ["GOOGLE_API_KEY"],
    cost: { unit: "second", usd: 0.5 },
    skills: ["ai-video-gen", "veo"],
    url: "https://generativelanguage.googleapis.com/v1beta/models/veo-2.0-generate-001:predict",
    authPrefix: undefined,
  },
  {
    tool: minimaxVideo,
    name: "minimax_video",
    capability: "image_to_video",
    provider: "minimax",
    env: ["MINIMAX_API_KEY"],
    cost: { unit: "clip", usd: 0.5 },
    skills: ["ai-video-gen", "minimax"],
    url: "https://api.minimax.io/v1/video_generation",
    authPrefix: "Bearer ",
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function stubProviderEnv(): void {
  vi.stubEnv("KLING_ACCESS_KEY", "kling-access");
  vi.stubEnv("KLING_SECRET_KEY", "kling-secret");
  vi.stubEnv("REPLICATE_API_TOKEN", "replicate-token");
  vi.stubEnv("BYTEDANCE_API_KEY", "bytedance-token");
  vi.stubEnv("RUNWAY_API_KEY", "runway-token");
  vi.stubEnv("GOOGLE_API_KEY", "google-token");
  vi.stubEnv("MINIMAX_API_KEY", "minimax-token");
}

function expectedCost(spec: (typeof providers)[number], duration: number): number {
  return spec.cost.unit === "second" ? spec.cost.usd * duration : spec.cost.usd;
}

describe("premium video provider tools", () => {
  it("declares metadata, auth integration, costs, and Layer 3 skills", () => {
    for (const spec of providers) {
      expect(spec.tool).toMatchObject({
        name: spec.name,
        capability: spec.capability,
        provider: spec.provider,
        integration: { kind: "api", env: spec.env },
        cost: spec.cost,
        agent_skills: spec.skills,
      });
    }
  });

  it("validates the common fixture prompt shape", () => {
    for (const spec of providers) {
      expect(spec.tool.input.parse({ prompt: "fixture camera move", duration: 5, aspect_ratio: "16:9" })).toMatchObject({
        prompt: "fixture camera move",
        duration: 5,
        aspect_ratio: "16:9",
      });

      expect(() => spec.tool.input.parse({ prompt: "" })).toThrow();
      expect(() => spec.tool.input.parse({ prompt: "fixture", image_url: "not-a-url" })).toThrow();
    }
  });

  it("posts each provider's documented request shape and returns the tracked default cost", async () => {
    stubProviderEnv();
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
        spec.name === "veo_video"
          ? { prompt: "fixture camera move", duration: 5 }
          : { prompt: "fixture camera move", image_url: "https://cdn.example.com/ref.png", duration: 5 };

      const result = await spec.tool.execute(
        spec.tool.input.parse(params),
        context(),
      );
      const [url, options] = fetchMock.mock.calls[0] as FetchCall;
      const body = JSON.parse(options.body ?? "{}") as Record<string, unknown>;

      expect(url).toBe(spec.url);
      expect(options.method).toBe("POST");
      expect(options.headers).toEqual(expect.objectContaining({ "Content-Type": "application/json" }));
      if (spec.authPrefix) {
        expect(options.headers?.Authorization).toEqual(expect.stringContaining(spec.authPrefix));
      } else {
        expect(options.headers?.["x-goog-api-key"]).toBe("google-token");
      }
      expect(JSON.stringify(body)).toContain("fixture camera move");
      expect(result).toEqual({
        video_path: "projects/show/episode/clips/out.mp4",
        cost_usd: expectedCost(spec, 5),
        provider_request_id: "provider-request-1",
      });
    }
  });

  it("uses provider-specific body fields for the main video request", async () => {
    stubProviderEnv();
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ video_path: "projects/show/episode/clips/out.mp4" }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    await klingVideo.execute(klingVideo.input.parse({ prompt: "kling", image_url: "https://cdn.example.com/ref.png" }), context());
    expect(JSON.parse((fetchMock.mock.calls[0] as FetchCall)[1].body ?? "{}")).toMatchObject({
      image_url: "https://cdn.example.com/ref.png",
      prompt: "kling",
      duration: 5,
    });

    fetchMock.mockClear();
    await seedanceReplicate.execute(
      seedanceReplicate.input.parse({ prompt: "seedance replicate", image_url: "https://cdn.example.com/ref.png" }),
      context(),
    );
    expect(JSON.parse((fetchMock.mock.calls[0] as FetchCall)[1].body ?? "{}")).toMatchObject({
      model: "bytedance/seedance-2-0",
      input: {
        prompt: "seedance replicate",
        image: "https://cdn.example.com/ref.png",
      },
    });

    fetchMock.mockClear();
    await runwayVideo.execute(runwayVideo.input.parse({ prompt: "runway", image_url: "https://cdn.example.com/ref.png" }), context());
    expect(JSON.parse((fetchMock.mock.calls[0] as FetchCall)[1].body ?? "{}")).toMatchObject({
      model: "gen3a_turbo",
      promptText: "runway",
      promptImage: "https://cdn.example.com/ref.png",
    });

    fetchMock.mockClear();
    await veoVideo.execute(veoVideo.input.parse({ prompt: "veo scene" }), context());
    expect(JSON.parse((fetchMock.mock.calls[0] as FetchCall)[1].body ?? "{}")).toMatchObject({
      instances: [{ prompt: "veo scene" }],
      parameters: { durationSeconds: 5 },
    });

    fetchMock.mockClear();
    await minimaxVideo.execute(minimaxVideo.input.parse({ prompt: "minimax", image_url: "https://cdn.example.com/ref.png" }), context());
    expect(JSON.parse((fetchMock.mock.calls[0] as FetchCall)[1].body ?? "{}")).toMatchObject({
      model: "video-01",
      prompt: "minimax",
      first_frame_image: "https://cdn.example.com/ref.png",
    });
  });

  it("surfaces non-2xx provider responses with the response body", async () => {
    stubProviderEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad request", { status: 400 })),
    );

    await expect(
      runwayVideo.execute(runwayVideo.input.parse({ prompt: "fixture", image_url: "https://cdn.example.com/ref.png" }), context()),
    ).rejects.toThrow("runway video request failed (400): bad request");
  });

  it("records actual spend for per-second providers", async () => {
    stubProviderEnv();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        return new Response(JSON.stringify({ id: "provider-request-1", video_path: "projects/show/episode/clips/out.mp4" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }),
    );

    await expect(
      runwayVideo.execute(
        runwayVideo.input.parse({ prompt: "runway cost", image_url: "https://cdn.example.com/ref.png", duration: 10 }),
        context(),
      ),
    ).resolves.toMatchObject({ cost_usd: 0.5 });
    await expect(veoVideo.execute(veoVideo.input.parse({ prompt: "veo cost", duration: 10 }), context())).resolves.toMatchObject({
      cost_usd: 5,
    });
    await expect(
      seedanceReplicate.execute(
        seedanceReplicate.input.parse({ prompt: "seedance cost", image_url: "https://cdn.example.com/ref.png", duration: 10 }),
        context(),
      ),
    ).resolves.toMatchObject({ cost_usd: 0.5 });
  });

  it("serves repeated generation requests from the clip cache", async () => {
    stubProviderEnv();
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-video-cache-"));
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "provider-request-1", video_path: "projects/show/episode/clips/out.mp4" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const params = klingVideo.input.parse({
      prompt: "cached prompt",
      image_url: "https://cdn.example.com/ref.png",
      duration: 5,
    });
    const first = await klingVideo.execute(params, context(projectRoot));
    const second = await klingVideo.execute(params, context(projectRoot));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(first).toMatchObject({ video_path: "projects/show/episode/clips/out.mp4", cost_usd: 0.3 });
    expect(second).toMatchObject({
      video_path: "projects/show/episode/clips/out.mp4",
      cost_usd: 0,
      provider_request_id: expect.stringMatching(/^clip_cache:/),
    });
  });

  it("does not reuse cached clips across different reference images", async () => {
    stubProviderEnv();
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-video-cache-"));
    const fetchMock = vi.fn(async () => {
      const id = `provider-request-${fetchMock.mock.calls.length}`;
      return new Response(JSON.stringify({ id, video_path: `projects/show/episode/clips/${id}.mp4` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const first = await klingVideo.execute(
      klingVideo.input.parse({
        prompt: "same prompt",
        image_url: "https://cdn.example.com/ref-a.png",
        duration: 5,
      }),
      context(projectRoot),
    );
    const second = await klingVideo.execute(
      klingVideo.input.parse({
        prompt: "same prompt",
        image_url: "https://cdn.example.com/ref-b.png",
        duration: 5,
      }),
      context(projectRoot),
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(first.video_path).toBe("projects/show/episode/clips/provider-request-1.mp4");
    expect(second.video_path).toBe("projects/show/episode/clips/provider-request-2.mp4");
  });

  it("fails before fetch when required provider env vars are missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("RUNWAY_API_KEY", "");

    await expect(
      runwayVideo.execute(runwayVideo.input.parse({ prompt: "fixture", image_url: "https://cdn.example.com/ref.png" }), context()),
    ).rejects.toThrow("missing env: RUNWAY_API_KEY");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
