import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import braveImageSearch from "./brave-image-search.js";
import braveSearch from "./brave-search.js";

const ENV_NAME = "BRAVE_SEARCH_API_KEY";
const imageBytes = Buffer.from("brave-image-fixture");

let originalEnv: NodeJS.ProcessEnv;
let tempDirs: string[] = [];

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (originalEnv[ENV_NAME] === undefined) {
    delete process.env[ENV_NAME];
  } else {
    process.env[ENV_NAME] = originalEnv[ENV_NAME];
  }
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("brave search tools", () => {
  it("reports API env availability and per-call cost", async () => {
    delete process.env[ENV_NAME];

    await expect(braveSearch.isAvailable()).resolves.toEqual({
      available: false,
      reason: "missing env: BRAVE_SEARCH_API_KEY",
      fix: "env",
    });
    await expect(braveImageSearch.isAvailable()).resolves.toEqual({
      available: false,
      reason: "missing env: BRAVE_SEARCH_API_KEY",
      fix: "env",
    });

    process.env[ENV_NAME] = "brave-key";

    await expect(braveSearch.isAvailable()).resolves.toEqual({ available: true });
    await expect(braveImageSearch.isAvailable()).resolves.toEqual({ available: true });
    expect(braveSearch.capability).toBe("web_search");
    expect(braveImageSearch.capability).toBe("stock_image");
    expect(braveSearch.cost).toEqual({ unit: "call", usd: 0.005 });
    expect(braveImageSearch.cost).toEqual({ unit: "call", usd: 0.005 });
  });

  it("searches the web and maps results", async () => {
    process.env[ENV_NAME] = "brave-key";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(braveWebResponse()));
    vi.stubGlobal("fetch", fetchMock);

    const result = await braveSearch.execute(
      { query: "moog synthesizer history", count: 5, offset: 2, freshness: "py", country: "US", safesearch: "off" },
      testContext(await tempDir()),
    );

    const searchUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe("https://api.search.brave.com/res/v1/web/search");
    expect(searchUrl.searchParams.get("q")).toBe("moog synthesizer history");
    expect(searchUrl.searchParams.get("count")).toBe("5");
    expect(searchUrl.searchParams.get("offset")).toBe("2");
    expect(searchUrl.searchParams.get("freshness")).toBe("py");
    expect(searchUrl.searchParams.get("country")).toBe("US");
    expect(searchUrl.searchParams.get("safesearch")).toBe("off");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: { "X-Subscription-Token": "brave-key" },
    });
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title: "Moog Synthesizers",
      url: "https://example.test/moog",
      snippet: "A history of Moog synthesizers.",
      age: "2 years ago",
    });
    expect(result.provider).toBe("brave");
    expect(result.cost_usd).toBe(0.005);
  });

  it("throws a clear error without the API key", async () => {
    delete process.env[ENV_NAME];

    await expect(braveSearch.execute({ query: "anything" }, testContext(await tempDir()))).rejects.toThrow(
      "missing env: BRAVE_SEARCH_API_KEY",
    );
  });

  it("searches images, maps attribution, and downloads the top result", async () => {
    process.env[ENV_NAME] = "brave-key";
    const root = await tempDir();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(braveImageResponse()))
      .mockResolvedValueOnce(new Response(imageBytes));
    vi.stubGlobal("fetch", fetchMock);

    const result = await braveImageSearch.execute(
      { query: "vintage synthesizer", per_page: 4, safesearch: "strict" },
      testContext(root),
    );

    const searchUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe("https://api.search.brave.com/res/v1/images/search");
    expect(searchUrl.searchParams.get("q")).toBe("vintage synthesizer");
    expect(searchUrl.searchParams.get("count")).toBe("4");
    expect(searchUrl.searchParams.get("safesearch")).toBe("strict");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: { "X-Subscription-Token": "brave-key" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://images.example.test/synth-1.jpg");
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title: "Minimoog Model D",
      url: "https://images.example.test/synth-1.jpg",
      thumbnail_url: "https://thumbs.example.test/synth-1.jpg",
      width: 1920,
      height: 1080,
      attribution: {
        source_url: "https://example.test/synth-page",
        source: "brave",
        source_domain: "example.test",
        license: "Unknown license — verify before publication",
      },
    });
    expect(result.provider).toBe("brave");
    expect(result.cost_usd).toBe(0.005);
    expect(result.image_path).toBeDefined();
    await expect(readFile(result.image_path ?? "")).resolves.toEqual(imageBytes);
  });

  it("skips download when download_top is false and drops results without image urls", async () => {
    process.env[ENV_NAME] = "brave-key";
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        results: [
          { title: "no image url", url: "https://example.test/page" },
          ...(braveImageResponse().results ?? []),
        ],
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await braveImageSearch.execute(
      { query: "vintage synthesizer", download_top: false },
      testContext(await tempDir()),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(result.results).toHaveLength(2);
    expect(result.image_path).toBeUndefined();
  });
});

function braveWebResponse() {
  return {
    web: {
      results: [
        {
          title: "Moog Synthesizers",
          url: "https://example.test/moog",
          description: "A history of Moog synthesizers.",
          age: "2 years ago",
        },
        {
          title: "Bob Moog Foundation",
          url: "https://example.test/foundation",
          description: "The legacy of Bob Moog.",
        },
      ],
    },
  };
}

function braveImageResponse() {
  return {
    results: [
      {
        title: "Minimoog Model D",
        url: "https://example.test/synth-page",
        source: "example.test",
        thumbnail: { src: "https://thumbs.example.test/synth-1.jpg" },
        properties: {
          url: "https://images.example.test/synth-1.jpg",
          width: 1920,
          height: 1080,
        },
      },
      {
        title: "ARP Odyssey",
        url: "https://example.test/arp-page",
        source: "example.test",
        thumbnail: { src: "https://thumbs.example.test/synth-2.jpg" },
        properties: {
          url: "https://images.example.test/synth-2.jpg",
          width: 1280,
          height: 720,
        },
      },
    ],
  };
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function tempDir(): Promise<string> {
  const dir = await mkdir(join(tmpdir(), `predit-brave-search-${crypto.randomUUID()}`), { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function testContext(root: string) {
  return {
    projectRoot: root,
    execution: {
      mode: "non_interactive" as const,
      io: { event: () => undefined },
    },
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
