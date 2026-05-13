import { mkdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import pexelsStock from "./pexels-stock.js";
import pixabayStock from "./pixabay-stock.js";
import unsplashStock from "./unsplash-stock.js";

const envNames = ["PEXELS_API_KEY", "PIXABAY_API_KEY", "UNSPLASH_ACCESS_KEY"];
const imageBytes = Buffer.from("stock-image-fixture");

let originalEnv: NodeJS.ProcessEnv;
let tempDirs: string[] = [];

beforeEach(() => {
  originalEnv = { ...process.env };
});

afterEach(async () => {
  vi.unstubAllGlobals();
  for (const name of envNames) {
    if (originalEnv[name] === undefined) {
      delete process.env[name];
    } else {
      process.env[name] = originalEnv[name];
    }
  }
  await Promise.all(tempDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  tempDirs = [];
});

describe("stock image tools", () => {
  it("reports API env availability and zero-cost stock image calls", async () => {
    for (const name of envNames) {
      delete process.env[name];
    }

    await expect(pexelsStock.isAvailable()).resolves.toEqual({
      available: false,
      reason: "missing env: PEXELS_API_KEY",
      fix: "env",
    });
    await expect(pixabayStock.isAvailable()).resolves.toEqual({
      available: false,
      reason: "missing env: PIXABAY_API_KEY",
      fix: "env",
    });
    await expect(unsplashStock.isAvailable()).resolves.toEqual({
      available: false,
      reason: "missing env: UNSPLASH_ACCESS_KEY",
      fix: "env",
    });

    process.env.PEXELS_API_KEY = "pexels-key";
    process.env.PIXABAY_API_KEY = "pixabay-key";
    process.env.UNSPLASH_ACCESS_KEY = "unsplash-key";

    await expect(pexelsStock.isAvailable()).resolves.toEqual({ available: true });
    await expect(pixabayStock.isAvailable()).resolves.toEqual({ available: true });
    await expect(unsplashStock.isAvailable()).resolves.toEqual({ available: true });
    expect(pexelsStock.capability).toBe("stock_image");
    expect(pixabayStock.capability).toBe("stock_image");
    expect(unsplashStock.capability).toBe("stock_image");
    expect(pexelsStock.cost).toEqual({ unit: "call", usd: 0 });
    expect(pixabayStock.cost).toEqual({ unit: "call", usd: 0 });
    expect(unsplashStock.cost).toEqual({ unit: "call", usd: 0 });
  });

  it("searches Pexels, maps attribution, and downloads the top result", async () => {
    process.env.PEXELS_API_KEY = "pexels-key";
    const root = await tempDir();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ photos: pexelsPhotos() }))
      .mockResolvedValueOnce(new Response(imageBytes));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pexelsStock.execute(
      { query: "city skyline", per_page: 3, orientation: "landscape", page: 2 },
      testContext(root),
    );

    const searchUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe("https://api.pexels.com/v1/search");
    expect(searchUrl.searchParams.get("query")).toBe("city skyline");
    expect(searchUrl.searchParams.get("per_page")).toBe("3");
    expect(searchUrl.searchParams.get("orientation")).toBe("landscape");
    expect(searchUrl.searchParams.get("page")).toBe("2");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: { Authorization: "pexels-key" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://images.example.test/pexels-1.jpg");
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toMatchObject({
      id: "101",
      url: "https://images.example.test/pexels-1.jpg",
      thumbnail_url: "https://images.example.test/pexels-1-thumb.jpg",
      width: 1600,
      height: 900,
      attribution: {
        photographer: "Pexels One",
        photographer_url: "https://www.pexels.com/@one",
        source_url: "https://www.pexels.com/photo/101",
        source: "pexels",
        license: "Pexels License",
      },
    });
    expect(result.provider).toBe("pexels");
    expect(result.cost_usd).toBe(0);
    expect(result.image_path).toBeDefined();
    await expect(readFile(result.image_path ?? "")).resolves.toEqual(imageBytes);
  });

  it("searches Pixabay, maps attribution, and downloads the top result", async () => {
    process.env.PIXABAY_API_KEY = "pixabay-key";
    const root = await tempDir();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ hits: pixabayHits() }))
      .mockResolvedValueOnce(new Response(imageBytes));
    vi.stubGlobal("fetch", fetchMock);

    const result = await pixabayStock.execute(
      { query: "forest trail", per_page: 3, orientation: "portrait", page: 3 },
      testContext(root),
    );

    const searchUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe("https://pixabay.com/api/");
    expect(searchUrl.searchParams.get("key")).toBe("pixabay-key");
    expect(searchUrl.searchParams.get("q")).toBe("forest trail");
    expect(searchUrl.searchParams.get("per_page")).toBe("3");
    expect(searchUrl.searchParams.get("orientation")).toBe("portrait");
    expect(searchUrl.searchParams.get("page")).toBe("3");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({ method: "GET" });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://images.example.test/pixabay-1.jpg");
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toMatchObject({
      id: "201",
      url: "https://images.example.test/pixabay-1.jpg",
      thumbnail_url: "https://images.example.test/pixabay-1-preview.jpg",
      width: 1200,
      height: 1800,
      attribution: {
        photographer: "pixabay_one",
        photographer_url: "https://pixabay.com/users/pixabay_one-901",
        source_url: "https://pixabay.com/photos/201",
        source: "pixabay",
        license: "Pixabay Content License",
      },
    });
    expect(result.provider).toBe("pixabay");
    expect(result.cost_usd).toBe(0);
    expect(result.image_path).toBeDefined();
    await expect(readFile(result.image_path ?? "")).resolves.toEqual(imageBytes);
  });

  it("searches Unsplash, maps attribution, and downloads the top result", async () => {
    process.env.UNSPLASH_ACCESS_KEY = "unsplash-key";
    const root = await tempDir();
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ results: unsplashPhotos() }))
      .mockResolvedValueOnce(new Response(imageBytes));
    vi.stubGlobal("fetch", fetchMock);

    const result = await unsplashStock.execute(
      { query: "studio portrait", per_page: 3, orientation: "square", page: 4 },
      testContext(root),
    );

    const searchUrl = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(`${searchUrl.origin}${searchUrl.pathname}`).toBe("https://api.unsplash.com/search/photos");
    expect(searchUrl.searchParams.get("query")).toBe("studio portrait");
    expect(searchUrl.searchParams.get("per_page")).toBe("3");
    expect(searchUrl.searchParams.get("orientation")).toBe("square");
    expect(searchUrl.searchParams.get("page")).toBe("4");
    expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
      method: "GET",
      headers: { Authorization: "Client-ID unsplash-key" },
    });
    expect(fetchMock).toHaveBeenNthCalledWith(2, "https://images.example.test/unsplash-1.jpg");
    expect(result.results).toHaveLength(3);
    expect(result.results[0]).toMatchObject({
      id: "unsplash-101",
      url: "https://images.example.test/unsplash-1.jpg",
      thumbnail_url: "https://images.example.test/unsplash-1-thumb.jpg",
      width: 1400,
      height: 1400,
      attribution: {
        photographer: "Unsplash One",
        photographer_url: "https://unsplash.com/@one",
        source_url: "https://unsplash.com/photos/unsplash-101",
        source: "unsplash",
        license: "Unsplash License",
      },
    });
    expect(result.provider).toBe("unsplash");
    expect(result.cost_usd).toBe(0);
    expect(result.image_path).toBeDefined();
    await expect(readFile(result.image_path ?? "")).resolves.toEqual(imageBytes);
  });
});

function pexelsPhotos() {
  return [
    {
      id: 101,
      width: 1600,
      height: 900,
      url: "https://www.pexels.com/photo/101",
      photographer: "Pexels One",
      photographer_url: "https://www.pexels.com/@one",
      src: {
        large: "https://images.example.test/pexels-1.jpg",
        tiny: "https://images.example.test/pexels-1-thumb.jpg",
      },
    },
    {
      id: 102,
      width: 1600,
      height: 900,
      url: "https://www.pexels.com/photo/102",
      photographer: "Pexels Two",
      photographer_url: "https://www.pexels.com/@two",
      src: {
        large: "https://images.example.test/pexels-2.jpg",
        tiny: "https://images.example.test/pexels-2-thumb.jpg",
      },
    },
    {
      id: 103,
      width: 1600,
      height: 900,
      url: "https://www.pexels.com/photo/103",
      photographer: "Pexels Three",
      photographer_url: "https://www.pexels.com/@three",
      src: {
        large: "https://images.example.test/pexels-3.jpg",
        tiny: "https://images.example.test/pexels-3-thumb.jpg",
      },
    },
  ];
}

function pixabayHits() {
  return [
    {
      id: 201,
      largeImageURL: "https://images.example.test/pixabay-1.jpg",
      previewURL: "https://images.example.test/pixabay-1-preview.jpg",
      imageWidth: 1200,
      imageHeight: 1800,
      user: "pixabay_one",
      user_id: 901,
      pageURL: "https://pixabay.com/photos/201",
    },
    {
      id: 202,
      largeImageURL: "https://images.example.test/pixabay-2.jpg",
      previewURL: "https://images.example.test/pixabay-2-preview.jpg",
      imageWidth: 1200,
      imageHeight: 1800,
      user: "pixabay_two",
      user_id: 902,
      pageURL: "https://pixabay.com/photos/202",
    },
    {
      id: 203,
      largeImageURL: "https://images.example.test/pixabay-3.jpg",
      previewURL: "https://images.example.test/pixabay-3-preview.jpg",
      imageWidth: 1200,
      imageHeight: 1800,
      user: "pixabay_three",
      user_id: 903,
      pageURL: "https://pixabay.com/photos/203",
    },
  ];
}

function unsplashPhotos() {
  return [
    {
      id: "unsplash-101",
      width: 1400,
      height: 1400,
      urls: {
        regular: "https://images.example.test/unsplash-1.jpg",
        thumb: "https://images.example.test/unsplash-1-thumb.jpg",
      },
      links: {
        html: "https://unsplash.com/photos/unsplash-101",
      },
      user: {
        name: "Unsplash One",
        links: {
          html: "https://unsplash.com/@one",
        },
      },
    },
    {
      id: "unsplash-102",
      width: 1400,
      height: 1400,
      urls: {
        regular: "https://images.example.test/unsplash-2.jpg",
        thumb: "https://images.example.test/unsplash-2-thumb.jpg",
      },
      links: {
        html: "https://unsplash.com/photos/unsplash-102",
      },
      user: {
        name: "Unsplash Two",
        links: {
          html: "https://unsplash.com/@two",
        },
      },
    },
    {
      id: "unsplash-103",
      width: 1400,
      height: 1400,
      urls: {
        regular: "https://images.example.test/unsplash-3.jpg",
        thumb: "https://images.example.test/unsplash-3-thumb.jpg",
      },
      links: {
        html: "https://unsplash.com/photos/unsplash-103",
      },
      user: {
        name: "Unsplash Three",
        links: {
          html: "https://unsplash.com/@three",
        },
      },
    },
  ];
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" },
  });
}

async function tempDir(): Promise<string> {
  const dir = await mkdir(join(tmpdir(), `predit-stock-image-${crypto.randomUUID()}`), { recursive: true });
  tempDirs.push(dir);
  return dir;
}

function testContext(root: string) {
  return {
    projectRoot: root,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
