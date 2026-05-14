import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../registry/tool.js";
import archiveOrg from "./archive_org.js";
import esa from "./esa.js";
import jaxa from "./jaxa.js";
import loc from "./loc.js";
import nara from "./nara.js";
import nasa from "./nasa.js";
import noaa from "./noaa.js";
import unsplash from "./unsplash.js";
import wikimedia from "./wikimedia.js";

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
  { tool: archiveOrg, name: "archive_org", capability: "stock_video", provider: "archive_org", env: [], skills: ["stock-video", "archive-org"] },
  { tool: nasa, name: "nasa", capability: "stock_video", provider: "nasa", env: [], skills: ["stock-video", "nasa"] },
  { tool: noaa, name: "noaa", capability: "stock_video", provider: "noaa", env: ["NOAA_FEED_URL"], skills: ["stock-video", "noaa"] },
  { tool: jaxa, name: "jaxa", capability: "stock_video", provider: "jaxa", env: ["JAXA_FEED_URL"], skills: ["stock-video", "jaxa"] },
  { tool: esa, name: "esa", capability: "stock_video", provider: "esa", env: [], skills: ["stock-video", "esa"] },
  { tool: loc, name: "loc", capability: "stock_video", provider: "loc", env: [], skills: ["stock-video", "loc"] },
  { tool: nara, name: "nara", capability: "stock_video", provider: "nara", env: [], skills: ["stock-video", "nara"] },
  { tool: wikimedia, name: "wikimedia", capability: "stock_video", provider: "wikimedia", env: [], skills: ["stock-video", "wikimedia"] },
  { tool: unsplash, name: "unsplash", capability: "stock_image", provider: "unsplash", env: ["UNSPLASH_ACCESS_KEY"], skills: ["stock-image", "unsplash"] },
] as const;

const apiProviderSpecs = [
  {
    tool: archiveOrg,
    host: "archive.org",
    pathname: "/advancedsearch.php",
    response: {
      response: { docs: [{ identifier: "apollo_11", title: "Apollo 11", creator: ["NASA"] }] },
    },
    expected: {
      video_url: "https://archive.org/download/apollo_11",
      thumbnail_url: "https://archive.org/services/img/apollo_11",
      attribution: {
        source: "archive_org",
        author: "NASA",
        source_url: "https://archive.org/details/apollo_11",
        license: "Public Domain (varies by item)",
      },
    },
  },
  {
    tool: nasa,
    host: "images-api.nasa.gov",
    pathname: "/search",
    response: {
      collection: {
        items: [
          {
            href: "https://images-assets.nasa.gov/asset/apollo/collection.json",
            data: [{ nasa_id: "apollo", center: "NASA", title: "Apollo landing" }],
            links: [{ href: "https://images-assets.nasa.gov/image/apollo/apollo~thumb.jpg" }],
          },
        ],
      },
    },
    expected: {
      video_url: "https://images-assets.nasa.gov/video/apollo/apollo~orig.mp4",
      thumbnail_url: "https://images-assets.nasa.gov/image/apollo/apollo~thumb.jpg",
      attribution: {
        source: "nasa",
        author: "NASA",
        source_url: "https://images.nasa.gov/details-apollo",
        license: "Public Domain (NASA)",
      },
    },
  },
  {
    tool: esa,
    host: "www.esa.int",
    pathname: "/services/api/search",
    response: {
      results: [
        {
          video_url: "https://esa.int/videos/earth.mp4",
          thumbnail_url: "https://esa.int/videos/earth.jpg",
          author: "ESA",
          source_url: "https://esa.int/earth",
          license: "ESA Standard License",
        },
      ],
    },
    expected: {
      video_url: "https://esa.int/videos/earth.mp4",
      thumbnail_url: "https://esa.int/videos/earth.jpg",
      attribution: {
        source: "esa",
        author: "ESA",
        source_url: "https://esa.int/earth",
        license: "ESA Standard License",
      },
    },
  },
  {
    tool: loc,
    host: "www.loc.gov",
    pathname: "/search/",
    response: {
      results: [
        {
          url: "https://www.loc.gov/item/fixture/",
          image_url: "https://www.loc.gov/static/images/fixture.jpg",
          contributor: ["Library of Congress"],
        },
      ],
    },
    expected: {
      video_url: "https://www.loc.gov/item/fixture/",
      thumbnail_url: "https://www.loc.gov/static/images/fixture.jpg",
      attribution: {
        source: "loc",
        author: "Library of Congress",
        source_url: "https://www.loc.gov/item/fixture/",
        license: "Public Domain (LoC public-domain collection)",
      },
    },
  },
  {
    tool: nara,
    host: "catalog.archives.gov",
    pathname: "/api/v2/records/search",
    response: {
      body: {
        hits: {
          hits: [
            {
              _source: {
                naId: "12345",
                creator: "National Archives",
                objects: [{ objectUrl: "https://catalog.archives.gov/OpaAPI/media/12345/content/dc-metro.mp4" }],
                thumbnailUrl: "https://catalog.archives.gov/OpaAPI/media/12345/thumbnail",
              },
            },
          ],
        },
      },
    },
    expected: {
      video_url: "https://catalog.archives.gov/OpaAPI/media/12345/content/dc-metro.mp4",
      thumbnail_url: "https://catalog.archives.gov/OpaAPI/media/12345/thumbnail",
      attribution: {
        source: "nara",
        author: "National Archives",
        source_url: "https://catalog.archives.gov/id/12345",
        license: "Public Domain (US Government work)",
      },
    },
  },
  {
    tool: wikimedia,
    host: "commons.wikimedia.org",
    pathname: "/w/api.php",
    response: {
      query: {
        pages: {
          "10": {
            title: "File:City.webm",
            imageinfo: [
              {
                url: "https://upload.wikimedia.org/wikipedia/commons/fixture/city.webm",
                thumburl: "https://upload.wikimedia.org/wikipedia/commons/thumb/fixture/city.webm.jpg",
                descriptionurl: "https://commons.wikimedia.org/wiki/File:City.webm",
                extmetadata: {
                  Artist: { value: "<span>Commons Creator</span>" },
                  LicenseShortName: { value: "CC BY-SA 4.0" },
                },
              },
            ],
          },
        },
      },
    },
    expected: {
      video_url: "https://upload.wikimedia.org/wikipedia/commons/fixture/city.webm",
      thumbnail_url: "https://upload.wikimedia.org/wikipedia/commons/thumb/fixture/city.webm.jpg",
      attribution: {
        source: "wikimedia",
        author: "Commons Creator",
        source_url: "https://commons.wikimedia.org/wiki/File:City.webm",
        license: "CC BY-SA 4.0",
      },
    },
  },
  {
    tool: unsplash,
    host: "api.unsplash.com",
    pathname: "/search/photos",
    response: {
      results: [
        {
          urls: { raw: "https://images.unsplash.com/photo-fixture", thumb: "https://images.unsplash.com/photo-fixture-thumb" },
          links: { html: "https://unsplash.com/photos/fixture" },
          user: { name: "Unsplash Creator" },
          width: 3000,
          height: 2000,
        },
      ],
    },
    expected: {
      image_url: "https://images.unsplash.com/photo-fixture",
      thumbnail_url: "https://images.unsplash.com/photo-fixture-thumb",
      width: 3000,
      height: 2000,
      attribution: {
        source: "unsplash",
        author: "Unsplash Creator",
        source_url: "https://unsplash.com/photos/fixture",
        license: "Unsplash License",
      },
    },
  },
] as const;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("public-domain and government stock tools", () => {
  it("declares metadata, setup integration, costs, and attribution-oriented skills", () => {
    for (const spec of providers) {
      expect(spec.tool).toMatchObject({
        name: spec.name,
        capability: spec.capability,
        provider: spec.provider,
        status: "beta",
        integration: { kind: "api", env: spec.env },
        cost: { unit: "call", usd: 0 },
        agent_skills: spec.skills,
      });
    }
  });

  it("validates the shared stock query input shape", () => {
    for (const spec of providers) {
      expect(spec.tool.input.parse({ query: "apollo landing", per_page: 3 })).toMatchObject({
        query: "apollo landing",
        per_page: 3,
      });

      expect(() => spec.tool.input.parse({ query: "" })).toThrow();
      expect(() => spec.tool.input.parse({ query: "apollo", per_page: 0 })).toThrow();
    }
  });

  it("queries API-backed sources and normalizes attributed matches", async () => {
    for (const spec of apiProviderSpecs) {
      if (spec.tool.name === "unsplash") {
        vi.stubEnv("UNSPLASH_ACCESS_KEY", "unsplash-key");
      }

      const fetchMock = vi.fn(async (url: string) => {
        if (spec.tool.name === "nasa" && url === "https://images-assets.nasa.gov/asset/apollo/collection.json") {
          return new Response(JSON.stringify(["https://images-assets.nasa.gov/video/apollo/apollo~orig.mp4"]), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }

        return new Response(JSON.stringify(spec.response), { status: 200, headers: { "Content-Type": "application/json" } });
      });
      vi.stubGlobal("fetch", fetchMock);

      const result = await spec.tool.execute(spec.tool.input.parse({ query: "apollo landing", per_page: 3 }), context());
      const [url, options] = fetchMock.mock.calls[0] as FetchCall;
      const parsedUrl = new URL(url);

      expect(parsedUrl.host).toBe(spec.host);
      expect(parsedUrl.pathname).toBe(spec.pathname);
      expect(options?.method).toBe("GET");
      expect(result.matches[0]).toEqual(spec.expected);

      if (spec.tool.name === "unsplash") {
        expect(options?.headers).toEqual({ Authorization: "Client-ID unsplash-key" });
      }

      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });

  it("filters NOAA and JAXA configured manifests and preserves attribution", async () => {
    const manifestSpecs = [
      { tool: noaa, env: "NOAA_FEED_URL", source: "noaa", license: "Public Domain (US Government work)" },
      { tool: jaxa, env: "JAXA_FEED_URL", source: "jaxa", license: "JAXA Public Use License" },
    ] as const;

    for (const spec of manifestSpecs) {
      const projectRoot = await mkdtemp(join(tmpdir(), `predit-${spec.source}-`));
      const manifestPath = join(projectRoot, "feed.json");
      await writeFile(
        manifestPath,
        JSON.stringify({
          clips: [
            {
              title: "Earth observation timelapse",
              tags: ["earth", "orbit", "science"],
              video_url: `https://cdn.example.com/${spec.source}/earth.mp4`,
              thumbnail_url: `https://cdn.example.com/${spec.source}/earth.jpg`,
              author: `${spec.source.toUpperCase()} Creator`,
              source_url: `https://example.com/${spec.source}/earth`,
            },
          ],
        }),
      );
      vi.stubEnv(spec.env, manifestPath);

      const result = await spec.tool.execute(spec.tool.input.parse({ query: "earth", per_page: 3 }), context(projectRoot));

      expect(result.matches).toEqual([
        {
          video_url: `https://cdn.example.com/${spec.source}/earth.mp4`,
          thumbnail_url: `https://cdn.example.com/${spec.source}/earth.jpg`,
          attribution: {
            source: spec.source,
            author: `${spec.source.toUpperCase()} Creator`,
            source_url: `https://example.com/${spec.source}/earth`,
            license: spec.license,
          },
        },
      ]);
      vi.unstubAllEnvs();
    }
  });

  it("surfaces non-2xx source responses with the response body", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("bad request", { status: 400 })),
    );

    await expect(esa.execute(esa.input.parse({ query: "earth" }), context())).rejects.toThrow(
      "esa stock video request failed (400): bad request",
    );
  });
});
