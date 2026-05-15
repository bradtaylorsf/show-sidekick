import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../registry/tool.js";
import catboxHost from "./catbox-host.js";
import higgsfield from "./higgsfield.js";

function noopLogger(): ToolContext["logger"] {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectRoot: "/project",
    logger: noopLogger(),
    execution: { mode: "non_interactive" },
    runCli: vi.fn(async () => ({
      stdout: JSON.stringify({ video_path: "projects/show/episode/clips/higgsfield.mp4" }),
      stderr: "",
    })),
    ...overrides,
  };
}

describe("higgsfield tool", () => {
  it("declares the CLI integration, cost, and Layer 3 skills", () => {
    expect(higgsfield).toMatchObject({
      name: "higgsfield",
      capability: "image_to_video",
      provider: "higgsfield",
      status: "production",
      integration: {
        kind: "cli",
        binary: "higgsfield",
        auth: { mode: "cli-login", check: "higgsfield account status --json" },
        install: expect.stringContaining("higgsfield auth login"),
      },
      cost: { unit: "clip", usd: 0.3 },
      agent_skills: ["higgsfield-generate", "ai-video-gen"],
    });
  });

  it("accepts only 5 and 10 second Kling durations", () => {
    expect(
      higgsfield.input.parse({
        image_url: "https://cdn.example.com/reference.png",
        prompt: "slow cinematic push-in",
        duration: 5,
      }),
    ).toMatchObject({ duration: 5 });

    expect(
      higgsfield.input.parse({
        image_url: "https://cdn.example.com/reference.png",
        prompt: "slow cinematic push-in",
        duration: 10,
      }),
    ).toMatchObject({ duration: 10 });

    expect(() =>
      higgsfield.input.parse({
        image_url: "https://cdn.example.com/reference.png",
        prompt: "slow cinematic push-in",
        duration: 7,
      }),
    ).toThrow();
  });

  it("records the Kling v2.1 Pro image-to-video wire shape", async () => {
    vi.stubEnv("HIGGSFIELD_API_KEY", "live-key");
    vi.stubEnv("HIGGSFIELD_API_SECRET", "live-secret");
    const ctx = context();

    const result = await higgsfield.execute(
      higgsfield.input.parse({
        image_url: "https://cdn.example.com/reference.png",
        prompt: "animate the subject with gentle camera drift",
        duration: 5,
      }),
      ctx,
    );

    expect(ctx.runCli).toHaveBeenCalledWith(
      "higgsfield",
      expect.arrayContaining(["kling-video", "v2.1", "pro", "image-to-video"]),
      expect.objectContaining({
        env: expect.objectContaining({ HIGGSFIELD_RECORD_HTTP: "1" }),
      }),
    );
    expect(result.request.url.endsWith("kling-video/v2.1/pro/image-to-video")).toBe(true);
    expect(result.request.headers.Authorization).toBe("Key <redacted>:<redacted>");
    expect(result.request.headers.Authorization).not.toContain("live-key");
    expect(result.request.headers.Authorization).not.toContain("live-secret");
    expect(result.request.headers.Authorization).not.toMatch(/^Bearer /);
    expect(result.request.body).toEqual({
      image_url: "https://cdn.example.com/reference.png",
      prompt: "animate the subject with gentle camera drift",
      duration: 5,
    });
    expect(result.request.body).not.toHaveProperty("parameters");
    expect(result.cost_usd).toBe(0.3);
  });

  it("uses the recorded CLI request when the CLI returns one", async () => {
    const recordedRequest = {
      url: "https://api.higgsfield.ai/kling-video/v2.1/pro/image-to-video",
      headers: {
        Authorization: "Key live-key:live-secret",
        "Content-Type": "application/json",
      },
      body: {
        image_url: "https://cdn.example.com/reference.png",
        prompt: "high energy motion",
        duration: 10,
      },
    };
    const ctx = context({
      runCli: vi.fn(async () => ({
        stdout: JSON.stringify({
          video_path: "projects/show/episode/clips/live.mp4",
          request: recordedRequest,
        }),
        stderr: "",
      })),
    });

    const result = await higgsfield.execute(
      higgsfield.input.parse({
        image_url: "https://cdn.example.com/reference.png",
        prompt: "high energy motion",
        duration: 10,
      }),
      ctx,
    );

    expect(result.request).toEqual({
      ...recordedRequest,
      headers: {
        ...recordedRequest.headers,
        Authorization: "Key <redacted>:<redacted>",
      },
    });
    expect(JSON.stringify(result.request)).not.toContain("live-key");
    expect(JSON.stringify(result.request)).not.toContain("live-secret");
  });

  it("serves repeated CLI generations from cache without colliding reference images", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-higgsfield-cache-"));
    const runCli = vi.fn(async () => {
      const id = `higgsfield-${runCli.mock.calls.length}`;
      return {
        stdout: JSON.stringify({ video_path: `projects/show/episode/clips/${id}.mp4` }),
        stderr: "",
      };
    });
    const ctx = context({ projectRoot, runCli });

    const first = await higgsfield.execute(
      higgsfield.input.parse({
        image_url: "https://cdn.example.com/reference-a.png",
        prompt: "same prompt",
        duration: 5,
      }),
      ctx,
    );
    const second = await higgsfield.execute(
      higgsfield.input.parse({
        image_url: "https://cdn.example.com/reference-a.png",
        prompt: "same prompt",
        duration: 5,
      }),
      ctx,
    );
    const differentImage = await higgsfield.execute(
      higgsfield.input.parse({
        image_url: "https://cdn.example.com/reference-b.png",
        prompt: "same prompt",
        duration: 5,
      }),
      ctx,
    );

    expect(runCli).toHaveBeenCalledTimes(2);
    expect(first).toMatchObject({ video_path: "projects/show/episode/clips/higgsfield-1.mp4", cost_usd: 0.3 });
    expect(second).toMatchObject({ video_path: "projects/show/episode/clips/higgsfield-1.mp4", cost_usd: 0 });
    expect(differentImage).toMatchObject({ video_path: "projects/show/episode/clips/higgsfield-2.mp4", cost_usd: 0.3 });
  });

  it("uploads local image paths through image hosting before building the request", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-higgsfield-"));
    await mkdir(join(projectRoot, "assets"), { recursive: true });
    await writeFile(join(projectRoot, "assets", "reference.png"), "image-bytes");
    const fetchMock = vi.fn(async () => new Response("https://assets.example.com/hosted-reference.png", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const select = vi.fn(async () => catboxHost);
    const ctx = context({ projectRoot, registry: { select } });

    const result = await higgsfield.execute(
      higgsfield.input.parse({
        image_path: "assets/reference.png",
        prompt: "subtle character animation",
      }),
      ctx,
    );

    expect(select).toHaveBeenCalledWith("image_hosting");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://catbox.moe/user/api.php",
      expect.objectContaining({ method: "POST", body: expect.any(FormData) }),
    );
    expect(result.request.body.image_url).toBe("https://assets.example.com/hosted-reference.png");
  });
});
