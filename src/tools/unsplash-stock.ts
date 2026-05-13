import { z } from "zod";
import { responseBytes, responseJson, writeGeneratedImage } from "../media/generated-image.js";
import { defineTool } from "../registry/index.js";

const PROVIDER = "unsplash";
const LICENSE = "Unsplash License";

export const UnsplashStockInputSchema = z.object({
  query: z.string().min(1),
  per_page: z.number().int().min(1).max(80).default(10),
  orientation: z.enum(["landscape", "portrait", "square"]).optional(),
  page: z.number().int().min(1).default(1),
  download_top: z.boolean().default(true),
});

export const UnsplashStockOutputSchema = z.object({
  results: z.array(
    z.object({
      id: z.string(),
      url: z.string().url(),
      thumbnail_url: z.string().url().optional(),
      width: z.number().int().positive(),
      height: z.number().int().positive(),
      attribution: z.object({
        photographer: z.string(),
        photographer_url: z.string().url().optional(),
        source_url: z.string().url(),
        source: z.literal(PROVIDER),
        license: z.literal(LICENSE),
      }),
    }),
  ),
  image_path: z.string().optional(),
  provider: z.literal(PROVIDER),
  cost_usd: z.literal(0),
});

type UnsplashSearchResponse = {
  results?: Array<{
    id: string;
    width: number;
    height: number;
    urls: {
      regular: string;
      thumb?: string;
    };
    links: {
      html: string;
    };
    user: {
      name: string;
      links: {
        html?: string;
      };
    };
  }>;
};

export default defineTool({
  name: "unsplash_stock",
  capability: "stock_image",
  provider: PROVIDER,
  status: "beta",
  integration: {
    kind: "api",
    env: ["UNSPLASH_ACCESS_KEY"],
    install: "Set UNSPLASH_ACCESS_KEY to an Unsplash access key.",
  },
  best_for: "searching Unsplash for high-quality stock photography with creator attribution",
  supports: ["stock-search", "attribution"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["stock-image-attribution"],
  input: UnsplashStockInputSchema,
  output: UnsplashStockOutputSchema,

  async execute(params, ctx) {
    const input = UnsplashStockInputSchema.parse(params);
    const response = await responseJson<UnsplashSearchResponse>(
      await fetch(unsplashSearchUrl(input).toString(), {
        method: "GET",
        headers: {
          Authorization: `Client-ID ${requiredEnv("UNSPLASH_ACCESS_KEY")}`,
        },
      }),
      "unsplash stock image search",
    );

    const results = (response.results ?? []).map((photo) => ({
      id: photo.id,
      url: photo.urls.regular,
      thumbnail_url: photo.urls.thumb,
      width: photo.width,
      height: photo.height,
      attribution: {
        photographer: photo.user.name,
        photographer_url: photo.user.links.html,
        source_url: photo.links.html,
        source: PROVIDER,
        license: LICENSE,
      },
    }));

    let imagePath: string | undefined;
    if (input.download_top && results[0]) {
      const bytes = await responseBytes(await fetch(results[0].url), "unsplash stock image download");
      imagePath = await writeGeneratedImage(ctx, bytes);
    }

    return UnsplashStockOutputSchema.parse({
      results,
      image_path: imagePath,
      provider: PROVIDER,
      cost_usd: 0,
    });
  },
});

function unsplashSearchUrl(input: z.infer<typeof UnsplashStockInputSchema>): URL {
  const url = new URL("https://api.unsplash.com/search/photos");
  url.searchParams.set("query", input.query);
  url.searchParams.set("per_page", String(input.per_page));
  url.searchParams.set("page", String(input.page));
  if (input.orientation) {
    url.searchParams.set("orientation", input.orientation);
  }

  return url;
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`missing env: ${name}`);
  }

  return value;
}
