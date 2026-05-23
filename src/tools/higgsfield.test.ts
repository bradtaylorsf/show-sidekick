import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../registry/tool.js";
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

  it("records the Seedance 2.0 image-to-video wire shape", async () => {
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
      expect.arrayContaining([
        "generate",
        "create",
        "seedance_2_0",
        "--start-image",
        "https://cdn.example.com/reference.png",
        "--aspect_ratio",
        "16:9",
        "--wait",
      ]),
      expect.objectContaining({
        env: expect.objectContaining({ HIGGSFIELD_RECORD_HTTP: "1" }),
      }),
    );
    expect(result.request.url.endsWith("generate/create/seedance_2_0")).toBe(true);
    expect(result.request.headers.Authorization).toBe("Key <redacted>:<redacted>");
    expect(result.request.headers.Authorization).not.toContain("live-key");
    expect(result.request.headers.Authorization).not.toContain("live-secret");
    expect(result.request.headers.Authorization).not.toMatch(/^Bearer /);
    expect(result.request.body).toEqual({
      model: "seedance_2_0",
      start_image: "https://cdn.example.com/reference.png",
      prompt: "animate the subject with gentle camera drift",
      duration: 5,
      aspect_ratio: "16:9",
    });
    expect(result.request.body).not.toHaveProperty("parameters");
    expect(result.cost_usd).toBe(0.3);
  });

  it("passes portrait aspect through to Seedance generations", async () => {
    const ctx = context();

    const result = await higgsfield.execute(
      higgsfield.input.parse({
        image_url: "https://cdn.example.com/reference.png",
        prompt: "animate the subject with gentle camera drift",
        duration: 5,
        aspect_ratio: "9:16",
      }),
      ctx,
    );

    expect(ctx.runCli).toHaveBeenCalledWith(
      "higgsfield",
      expect.arrayContaining(["--aspect_ratio", "9:16"]),
      expect.any(Object),
    );
    expect(result.request.body.aspect_ratio).toBe("9:16");
  });

  it("uses the recorded CLI request when the CLI returns one", async () => {
    const recordedRequest = {
      url: "https://api.higgsfield.ai/generate/create/seedance_2_0",
      headers: {
        Authorization: "Key live-key:live-secret",
        "Content-Type": "application/json",
      },
      body: {
        model: "seedance_2_0",
        start_image: "https://cdn.example.com/reference.png",
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
    const differentAspect = await higgsfield.execute(
      higgsfield.input.parse({
        image_url: "https://cdn.example.com/reference-a.png",
        prompt: "same prompt",
        duration: 5,
        aspect_ratio: "9:16",
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

    expect(runCli).toHaveBeenCalledTimes(3);
    expect(first).toMatchObject({ video_path: "projects/show/episode/clips/higgsfield-1.mp4", cost_usd: 0.3 });
    expect(second).toMatchObject({ video_path: "projects/show/episode/clips/higgsfield-1.mp4", cost_usd: 0 });
    expect(differentAspect).toMatchObject({ video_path: "projects/show/episode/clips/higgsfield-2.mp4", cost_usd: 0.3 });
    expect(differentImage).toMatchObject({ video_path: "projects/show/episode/clips/higgsfield-3.mp4", cost_usd: 0.3 });
  });

  it("passes local image paths directly to the current Higgsfield CLI", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-higgsfield-"));
    await mkdir(join(projectRoot, "assets"), { recursive: true });
    await writeFile(join(projectRoot, "assets", "reference.png"), "image-bytes");
    const ctx = context({ projectRoot });

    const result = await higgsfield.execute(
      higgsfield.input.parse({
        image_path: "assets/reference.png",
        prompt: "subtle character animation",
      }),
      ctx,
    );

    expect(ctx.runCli).toHaveBeenCalledWith(
      "higgsfield",
      expect.arrayContaining(["--start-image", join(projectRoot, "assets", "reference.png")]),
      expect.any(Object),
    );
    expect(result.request.body.start_image).toBe(join(projectRoot, "assets", "reference.png"));
  });

  it("extracts a result URL from the current wait JSON response shape", async () => {
    const ctx = context({
      runCli: vi.fn(async () => ({
        stdout: JSON.stringify([
          {
            id: "job",
            result: {
              url: "https://cdn.higgsfield.example/video.mp4",
            },
          },
        ]),
        stderr: "",
      })),
    });

    const result = await higgsfield.execute(
      higgsfield.input.parse({
        image_url: "https://cdn.example.com/reference.png",
        prompt: "camera move",
      }),
      ctx,
    );

    expect(result.video_path).toBe("https://cdn.higgsfield.example/video.mp4");
  });

  it("rejects media-upload preview images instead of accepting them as video clips", async () => {
    const ctx = context({
      runCli: vi.fn(async () => ({
        stdout: JSON.stringify([
          {
            id: "upload-job",
            result: {
              url: "https://cdn.higgsfield.example/reference_resize.jpg",
            },
          },
        ]),
        stderr: "",
      })),
    });

    await expect(
      higgsfield.execute(
        higgsfield.input.parse({
          image_url: "https://cdn.example.com/reference.png",
          prompt: "camera move",
        }),
        ctx,
      ),
    ).rejects.toThrow("Higgsfield CLI did not return a video result URL or path");
  });
});
