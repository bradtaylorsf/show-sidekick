import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../registry/tool.js";
import coverr from "./coverr.js";
import dareful from "./dareful.js";
import mixkit from "./mixkit.js";
import pexelsVideo from "./pexels_video.js";
import pixabayVideo from "./pixabay_video.js";
import pond5Pd from "./pond5_pd.js";
import videvo from "./videvo.js";

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
  return { projectRoot, logger: noopLogger() };
}

type FetchCall = [string, { method?: string; headers?: Record<string, string> } | undefined];

const providers = [
  {
    tool: pexelsVideo,
    name: "pexels_video",
    provider: "pexels",
    env: ["PEXELS_API_KEY"],
    skills: ["stock-video", "pexels"],
  },
  {
    tool: pixabayVideo,
    name: "pixabay_video",
    provider: "pixabay",
    env: ["PIXABAY_API_KEY"],
    skills: ["stock-video", "pixabay"],
  },
  {
    tool: mixkit,
    name: "mixkit",
    provider: "mixkit",
    env: ["MIXKIT_FEED_URL"],
    skills: ["stock-video", "mixkit"],
  },
  {
    tool: coverr,
    name: "coverr",
    provider: "coverr",
    env: ["COVERR_FEED_URL"],
    skills: ["stock-video", "coverr"],
  },
  {
    tool: dareful,
    name: "dareful",
    provider: "dareful",
    env: ["DAREFUL_FEED_URL"],
    skills: ["stock-video", "dareful"],
  },
  {
    tool: pond5Pd,
    name: "pond5_pd",
    provider: "pond5",
    env: ["POND5_PD_FEED_URL"],
    skills: ["stock-video", "pond5"],
  },
  {
    tool: videvo,
    name: "videvo",
    provider: "videvo",
    env: ["VIDEVO_FEED_URL"],
    skills: ["stock-video", "videvo"],
  },
] as const;

const manifestProviders = [
  { tool: mixkit, env: "MIXKIT_FEED_URL", source: "mixkit", license: "Mixkit License" },
  { tool: coverr, env: "COVERR_FEED_URL", source: "coverr", license: "Coverr License (free for commercial use, no attribution required)" },
  { tool: dareful, env: "DAREFUL_FEED_URL", source: "dareful", license: "CC BY 4.0" },
  { tool: pond5Pd, env: "POND5_PD_FEED_URL", source: "pond5", license: "Public Domain" },
  { tool: videvo, env: "VIDEVO_FEED_URL", source: "videvo", license: "Videvo License" },
] as const;

const bundledFixtureProviders = [
  { tool: mixkit, env: "MIXKIT_FEED_URL", fixture: "mixkit.json" },
  { tool: coverr, env: "COVERR_FEED_URL", fixture: "coverr.json" },
  { tool: dareful, env: "DAREFUL_FEED_URL", fixture: "dareful.json" },
  { tool: pond5Pd, env: "POND5_PD_FEED_URL", fixture: "pond5_pd.json" },
  { tool: videvo, env: "VIDEVO_FEED_URL", fixture: "videvo.json" },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("stock video provider tools", () => {
  it("declares stock-video metadata, setup integration, costs, and Layer 3 skills", () => {
    for (const spec of providers) {
      expect(spec.tool).toMatchObject({
        name: spec.name,
        capability: "stock_video",
        provider: spec.provider,
        status: "beta",
        integration: { kind: "api", env: spec.env },
        cost: { unit: "call", usd: 0 },
        agent_skills: spec.skills,
      });
    }
  });

  it("validates the shared stock-video query input shape", () => {
    for (const spec of providers) {
      expect(spec.tool.input.parse({ query: "city skyline", per_page: 3, aspect_ratio: "16:9", min_duration: 4 })).toMatchObject({
        query: "city skyline",
        per_page: 3,
        aspect_ratio: "16:9",
        min_duration: 4,
      });

      expect(() => spec.tool.input.parse({ query: "" })).toThrow();
      expect(() => spec.tool.input.parse({ query: "city", per_page: 0 })).toThrow();
    }
  });

  it("queries Pexels and normalizes video matches with attribution metadata", async () => {
    vi.stubEnv("PEXELS_API_KEY", "pexels-key");
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          videos: [
            {
              url: "https://www.pexels.com/video/fixture-1/",
              image: "https://images.pexels.com/videos/fixture-1.jpg",
              duration: 12,
              user: { name: "Fixture Creator" },
              video_files: [
                { file_type: "video/mp4", quality: "sd", link: "https://videos.pexels.com/fixture-1-sd.mp4", width: 640, height: 360 },
                { file_type: "video/mp4", quality: "hd", link: "https://videos.pexels.com/fixture-1-hd.mp4", width: 1920, height: 1080 },
              ],
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pexelsVideo.execute(pexelsVideo.input.parse({ query: "city skyline", per_page: 3 }), context());
    const [url, options] = fetchMock.mock.calls[0] as FetchCall;

    expect(url).toBe("https://api.pexels.com/videos/search?query=city+skyline&per_page=3");
    expect(options?.method).toBe("GET");
    expect(options?.headers).toEqual({ Authorization: "pexels-key" });
    expect(result).toEqual({
      matches: [
        {
          video_url: "https://videos.pexels.com/fixture-1-hd.mp4",
          thumbnail_url: "https://images.pexels.com/videos/fixture-1.jpg",
          duration: 12,
          width: 1920,
          height: 1080,
          attribution: {
            source: "pexels",
            author: "Fixture Creator",
            source_url: "https://www.pexels.com/video/fixture-1/",
            license: "Pexels License",
          },
        },
      ],
      cost_usd: 0,
    });
  });

  it("queries Pixabay and normalizes video matches with attribution metadata", async () => {
    vi.stubEnv("PIXABAY_API_KEY", "pixabay-key");
    const fetchMock = vi.fn(async () => {
      return new Response(
        JSON.stringify({
          hits: [
            {
              pageURL: "https://pixabay.com/videos/fixture-2/",
              user: "Pixabay Creator",
              duration: 9,
              videos: {
                medium: {
                  url: "https://cdn.pixabay.com/video/fixture-2.mp4",
                  width: 1280,
                  height: 720,
                  thumbnail: "https://cdn.pixabay.com/video/fixture-2.jpg",
                },
              },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pixabayVideo.execute(pixabayVideo.input.parse({ query: "ocean wave", per_page: 4 }), context());
    const [url, options] = fetchMock.mock.calls[0] as FetchCall;

    expect(url).toBe("https://pixabay.com/api/videos/?key=pixabay-key&q=ocean+wave&per_page=4");
    expect(options?.method).toBe("GET");
    expect(result.matches).toEqual([
      {
        video_url: "https://cdn.pixabay.com/video/fixture-2.mp4",
        thumbnail_url: "https://cdn.pixabay.com/video/fixture-2.jpg",
        duration: 9,
        width: 1280,
        height: 720,
        attribution: {
          source: "pixabay",
          author: "Pixabay Creator",
          source_url: "https://pixabay.com/videos/fixture-2/",
          license: "Pixabay Content License",
        },
      },
    ]);
  });

  it("filters configured manifest feeds by title or tags and preserves per-clip attribution", async () => {
    for (const spec of manifestProviders) {
      const projectRoot = await mkdtemp(join(tmpdir(), `predit-${spec.source}-`));
      const manifestPath = join(projectRoot, "feed.json");
      await writeFile(
        manifestPath,
        JSON.stringify({
          clips: [
            {
              title: "City skyline timelapse",
              tags: ["city", "night", "traffic"],
              video_url: `https://cdn.example.com/${spec.source}/city-1.mp4`,
              thumbnail_url: `https://cdn.example.com/${spec.source}/city-1.jpg`,
              duration: 7,
              width: 1920,
              height: 1080,
              author: "Manifest Creator",
              source_url: `https://example.com/${spec.source}/city-1`,
            },
            {
              title: "Quiet forest",
              tags: ["trees"],
              video_url: `https://cdn.example.com/${spec.source}/forest.mp4`,
              source_url: `https://example.com/${spec.source}/forest`,
            },
          ],
        }),
      );
      vi.stubEnv(spec.env, manifestPath);

      const result = await spec.tool.execute(spec.tool.input.parse({ query: "city", per_page: 3 }), context(projectRoot));

      expect(result).toEqual({
        matches: [
          {
            video_url: `https://cdn.example.com/${spec.source}/city-1.mp4`,
            thumbnail_url: `https://cdn.example.com/${spec.source}/city-1.jpg`,
            duration: 7,
            width: 1920,
            height: 1080,
            attribution: {
              source: spec.source,
              author: "Manifest Creator",
              source_url: `https://example.com/${spec.source}/city-1`,
              license: spec.license,
            },
          },
        ],
        cost_usd: 0,
      });
      vi.unstubAllEnvs();
    }
  });

  it("lets Videvo manifests override the default license per clip", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-videvo-license-"));
    const manifestPath = join(projectRoot, "feed.json");
    await writeFile(
      manifestPath,
      JSON.stringify({
        clips: [
          {
            title: "City public domain",
            tags: ["city"],
            video_url: "https://cdn.example.com/videvo/city-public-domain.mp4",
            source_url: "https://example.com/videvo/city-public-domain",
            license: "CC0",
          },
        ],
      }),
    );
    vi.stubEnv("VIDEVO_FEED_URL", manifestPath);

    const result = await videvo.execute(videvo.input.parse({ query: "city" }), context(projectRoot));

    expect(result.matches[0]?.attribution.license).toBe("CC0");
  });

  it("ships canonical fixture manifests for manifest-backed providers", async () => {
    for (const spec of bundledFixtureProviders) {
      vi.stubEnv(spec.env, bundledFixturePath(spec.fixture));

      const result = await spec.tool.execute(spec.tool.input.parse({ query: "city", per_page: 3 }), context());

      expect(result.matches).toHaveLength(3);
      expect(result.matches.every((match) => match.attribution.source.length > 0 && match.attribution.license.length > 0)).toBe(true);
      vi.unstubAllEnvs();
    }
  });

  it("surfaces non-2xx stock provider responses with the response body", async () => {
    vi.stubEnv("PEXELS_API_KEY", "pexels-key");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad request", { status: 400 })),
    );

    await expect(pexelsVideo.execute(pexelsVideo.input.parse({ query: "fixture" }), context())).rejects.toThrow(
      "pexels stock video request failed (400): bad request",
    );
  });

  it("fails before fetch when required stock-provider env vars are missing", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("PEXELS_API_KEY", "");

    await expect(pexelsVideo.execute(pexelsVideo.input.parse({ query: "fixture" }), context())).rejects.toThrow(
      "missing env: PEXELS_API_KEY",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function bundledFixturePath(fileName: string): string {
  return fileURLToPath(new URL(`../../bundled/fixtures/stock/${fileName}`, import.meta.url));
}
