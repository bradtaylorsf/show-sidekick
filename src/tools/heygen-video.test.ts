import { afterEach, describe, expect, it, vi } from "vitest";
import heygenVideo, { bodyForHeyGenMode, endpointForMode, normalizeHeyGenOutput } from "./heygen-video.js";

describe("heygen_video", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HEYGEN_API_KEY;
  });

  it("registers the HeyGen avatar video capability", () => {
    expect(heygenVideo.name).toBe("heygen_video");
    expect(heygenVideo.capability).toBe("avatar_video");
    expect(heygenVideo.integration).toMatchObject({ kind: "api", env: ["HEYGEN_API_KEY"] });
  });

  it("parses all workflow inputs and normalized output", () => {
    expect(heygenVideo.input.parse({ mode: "avatar_video", avatar_id: "a1", voice_id: "v1", script: "Hello" }).mode).toBe(
      "avatar_video",
    );
    expect(
      heygenVideo.input.parse({
        mode: "create_video",
        avatar_id: "a1",
        voice_id: "v1",
        script: "Hello",
        background: "studio",
      }).mode,
    ).toBe("create_video");
    expect(
      heygenVideo.input.parse({
        mode: "video_translate",
        source_video_url: "https://example.com/source.mp4",
        target_language: "es",
      }).mode,
    ).toBe("video_translate");

    expect(
      normalizeHeyGenOutput({
        data: { video_id: "vid-1", video_url: "https://example.com/video.mp4", status: "completed", duration: "12" },
      }),
    ).toEqual({
      video_id: "vid-1",
      video_url: "https://example.com/video.mp4",
      status: "succeeded",
      duration_s: 12,
    });
  });

  it("builds request bodies for avatar and translation modes", () => {
    expect(endpointForMode("avatar_video")).toBe("https://api.heygen.com/v2/video/generate");
    expect(endpointForMode("video_translate")).toBe("https://api.heygen.com/v2/video_translate/create");
    expect(bodyForHeyGenMode({ mode: "avatar_video", avatar_id: "a1", voice_id: "v1", script: "Hello" })).toMatchObject({
      video_inputs: [
        {
          character: { type: "avatar", avatar_id: "a1" },
          voice: { type: "text", voice_id: "v1", input_text: "Hello" },
        },
      ],
    });
    expect(
      bodyForHeyGenMode({
        mode: "video_translate",
        source_video_url: "https://example.com/source.mp4",
        target_language: "es",
        voice_id: "v1",
      }),
    ).toEqual({
      video_url: "https://example.com/source.mp4",
      output_language: "es",
      voice_id: "v1",
    });
  });

  it("posts avatar video requests with bearer auth", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ data: { video_id: "vid-1", status: "processing" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    process.env.HEYGEN_API_KEY = "secret";

    await expect(
      heygenVideo.execute(
        {
          mode: "avatar_video",
          avatar_id: "avatar-1",
          voice_id: "voice-1",
          script: "Welcome.",
        },
        testContext(),
      ),
    ).resolves.toMatchObject({ video_id: "vid-1", status: "processing" });

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.heygen.com/v2/video/generate");
    expect(init?.headers).toMatchObject({ Authorization: "Bearer secret", "Content-Type": "application/json" });
    expect(JSON.parse(String(init?.body))).toMatchObject({
      video_inputs: [{ character: { avatar_id: "avatar-1" }, voice: { voice_id: "voice-1", input_text: "Welcome." } }],
    });
  });

  it("posts translate requests to the translate endpoint", async () => {
    const fetchMock = vi.fn<typeof fetch>(
      async () =>
        new Response(JSON.stringify({ data: { video_id: "translate-1", status: "queued" } }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    process.env.HEYGEN_API_KEY = "secret";

    await heygenVideo.execute(
      {
        mode: "video_translate",
        source_video_url: "https://example.com/source.mp4",
        target_language: "fr",
      },
      testContext(),
    );

    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("https://api.heygen.com/v2/video_translate/create");
    expect(JSON.parse(String(init?.body))).toEqual({
      video_url: "https://example.com/source.mp4",
      output_language: "fr",
    });
  });
});

function testContext() {
  return {
    projectRoot: "/tmp/predit",
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
