import { afterEach, describe, expect, it, vi } from "vitest";
import { Registry } from "../registry/registry.js";
import type { ToolContext } from "../registry/tool.js";
import freesoundMusic from "./freesound_music.js";
import musicGen from "./music_gen.js";
import pixabayMusic from "./pixabay_music.js";
import sunoMusic from "./suno_music.js";

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
  return { projectRoot: "/project", logger: noopLogger(), ...overrides };
}

type FetchCall = [string, { method?: string; headers?: Record<string, string>; body?: string } | undefined];

const providers = [
  {
    tool: sunoMusic,
    name: "suno_music",
    provider: "suno",
    integration: { kind: "api", env: ["SUNO_API_KEY"] },
    skills: ["music", "suno"],
    cost: { unit: "call", usd: 0.05 },
  },
  {
    tool: freesoundMusic,
    name: "freesound_music",
    provider: "freesound",
    integration: { kind: "api", env: ["FREESOUND_API_KEY"] },
    skills: ["music", "freesound"],
    cost: { unit: "call", usd: 0 },
  },
  {
    tool: pixabayMusic,
    name: "pixabay_music",
    provider: "pixabay",
    integration: { kind: "api", env: ["PIXABAY_API_KEY"] },
    skills: ["music", "pixabay"],
    cost: { unit: "call", usd: 0 },
  },
  {
    tool: musicGen,
    name: "music_gen",
    provider: "local",
    integration: { kind: "library", package: "node:fetch" },
    skills: ["music-plan"],
    cost: { unit: "call", usd: 0 },
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("music generation provider tools", () => {
  it("declares music_generation metadata, setup integration, costs, and skills", () => {
    for (const spec of providers) {
      expect(spec.tool).toMatchObject({
        name: spec.name,
        capability: "music_generation",
        provider: spec.provider,
        integration: spec.integration,
        cost: spec.cost,
        agent_skills: spec.skills,
      });
    }
  });

  it("validates fixture query and generation prompt shapes", () => {
    expect(freesoundMusic.input.parse({ query: "lo-fi beats" })).toMatchObject({ query: "lo-fi beats", per_page: 5 });
    expect(pixabayMusic.input.parse({ query: "lo-fi beats", per_page: 3 })).toMatchObject({
      query: "lo-fi beats",
      per_page: 3,
    });
    expect(sunoMusic.input.parse({ prompt: "lo-fi beats, 80 bpm" })).toMatchObject({ prompt: "lo-fi beats, 80 bpm" });
    expect(musicGen.input.parse({ prompt: "lo-fi beats, 80 bpm", prefer: ["suno_music"] })).toMatchObject({
      prompt: "lo-fi beats, 80 bpm",
      prefer: ["suno_music"],
    });
    expect(() => freesoundMusic.input.parse({ query: "" })).toThrow();
    expect(() => sunoMusic.input.parse({ prompt: "" })).toThrow();
  });

  it("posts Suno's documented generation request shape and returns generated audio", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "suno-request-1", audio_path: "projects/show/episode/music/suno.mp3" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await sunoMusic.execute(sunoMusic.input.parse({ prompt: "lo-fi beats, 80 bpm", duration: 20 }), context());
    const [url, options] = fetchMock.mock.calls[0] as FetchCall;

    expect(url).toBe("https://api.suno.ai/v1/generate");
    expect(options?.method).toBe("POST");
    expect(options?.headers).toEqual(expect.objectContaining({ Authorization: "Bearer <SUNO_API_KEY>" }));
    expect(JSON.parse(options?.body ?? "{}")).toEqual({
      prompt: "lo-fi beats, 80 bpm",
      duration: 20,
      model: "suno-v3.5",
    });
    expect(result).toEqual({
      audio_path: "projects/show/episode/music/suno.mp3",
      cost_usd: 0.05,
      provider_request_id: "suno-request-1",
    });
  });

  it("queries Freesound and normalizes music matches with attribution", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          results: [
            {
              id: 123,
              duration: 42,
              previews: { "preview-hq-mp3": "https://freesound.org/preview/123.mp3" },
              license: "Creative Commons 0",
              username: "Freesound Creator",
              url: "https://freesound.org/s/123/",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await freesoundMusic.execute(freesoundMusic.input.parse({ query: "lo-fi beats", per_page: 3 }), context());
    const [url, options] = fetchMock.mock.calls[0] as FetchCall;

    expect(url).toBe(
      "https://freesound.org/apiv2/search/text/?query=lo-fi+beats&token=%3CFREESOUND_API_KEY%3E&fields=id%2Cname%2Cduration%2Cpreviews%2Clicense%2Cusername%2Curl&filter=type%3Awav+OR+type%3Amp3&page_size=3",
    );
    expect(options?.method).toBe("GET");
    expect(result).toEqual({
      matches: [
        {
          audio_url: "https://freesound.org/preview/123.mp3",
          preview_url: "https://freesound.org/preview/123.mp3",
          duration: 42,
          attribution: {
            source: "freesound",
            author: "Freesound Creator",
            source_url: "https://freesound.org/s/123/",
            license: "Creative Commons 0",
          },
        },
      ],
      cost_usd: 0,
    });
  });

  it("queries Pixabay music and normalizes matches with attribution", async () => {
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          hits: [
            {
              audio: "https://cdn.pixabay.com/audio/fixture.mp3",
              preview: "https://cdn.pixabay.com/audio/fixture-preview.mp3",
              duration: 75,
              bpm: 80,
              user: "Pixabay Creator",
              pageURL: "https://pixabay.com/music/fixture/",
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pixabayMusic.execute(pixabayMusic.input.parse({ query: "lo-fi beats", per_page: 2 }), context());
    const [url, options] = fetchMock.mock.calls[0] as FetchCall;

    expect(url).toBe("https://pixabay.com/api/audio/?key=%3CPIXABAY_API_KEY%3E&q=lo-fi+beats&per_page=2");
    expect(options?.method).toBe("GET");
    expect(result.matches).toEqual([
      {
        audio_url: "https://cdn.pixabay.com/audio/fixture.mp3",
        preview_url: "https://cdn.pixabay.com/audio/fixture-preview.mp3",
        duration: 75,
        bpm: 80,
        attribution: {
          source: "pixabay",
          author: "Pixabay Creator",
          source_url: "https://pixabay.com/music/fixture/",
          license: "Pixabay Content License",
        },
      },
    ]);
  });

  it("wires registry music_generation providers and routes music_gen to preferred available provider", async () => {
    const registry = new Registry({ tools: [musicGen, sunoMusic, freesoundMusic, pixabayMusic] });
    const originals = new Map(providers.map((spec) => [spec.tool.name, spec.tool.isAvailable]));
    const fetchMock = vi.fn(async () => {
      return new Response(JSON.stringify({ id: "suno-request-1", audio_path: "projects/show/episode/music/suno.mp3" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    try {
      sunoMusic.isAvailable = async () => ({ available: true });
      freesoundMusic.isAvailable = async () => ({ available: false, reason: "missing env", fix: "env" });
      pixabayMusic.isAvailable = async () => ({ available: false, reason: "missing env", fix: "env" });

      expect(registry.byCapability("music_generation").map((tool) => tool.name)).toEqual([
        "music_gen",
        "suno_music",
        "freesound_music",
        "pixabay_music",
      ]);

      const result = await musicGen.execute(
        musicGen.input.parse({ prompt: "jazz", prefer: ["suno_music"] }),
        context({ registry }),
      );

      expect(result).toEqual({
        matches: [
          {
            tool: "suno_music",
            provider: "suno",
            audio_path: "projects/show/episode/music/suno.mp3",
            provider_request_id: "suno-request-1",
          },
        ],
        cost_usd: 0.05,
      });
    } finally {
      for (const spec of providers) {
        const original = originals.get(spec.tool.name);
        if (original) {
          spec.tool.isAvailable = original;
        }
      }
    }
  });

  it("surfaces non-2xx music provider responses with the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad request", { status: 400 })),
    );

    await expect(freesoundMusic.execute(freesoundMusic.input.parse({ query: "fixture" }), context())).rejects.toThrow(
      "freesound music request failed (400): bad request",
    );
  });
});
