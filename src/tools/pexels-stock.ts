import { z } from "zod";
import { responseBytes, responseJson, writeGeneratedImage } from "../media/generated-image.js";
import { defineTool } from "../registry/index.js";

const PROVIDER = "pexels";
const LICENSE = "Pexels License";

export const PexelsStockInputSchema = z.object({
  query: z.string().min(1),
  per_page: z.number().int().min(1).max(80).default(10),
  orientation: z.enum(["landscape", "portrait", "square"]).optional(),
  page: z.number().int().min(1).default(1),
  download_top: z.boolean().default(true),
});

export const PexelsStockOutputSchema = z.object({
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

type PexelsSearchResponse = {
  photos?: Array<{
    id: number | string;
    width: number;
    height: number;
    url: string;
    photographer: string;
    photographer_url?: string;
    src: {
      large: string;
      tiny?: string;
    };
  }>;
};

export default defineTool({
  name: "pexels_stock",
  capability: "stock_image",
  provider: PROVIDER,
  status: "beta",
  integration: {
    kind: "api",
    env: ["PEXELS_API_KEY"],
    install: "Set PEXELS_API_KEY to a Pexels API key.",
  },
  best_for: "searching Pexels for production-ready editorial and commercial stock images",
  supports: ["stock-search", "attribution"],
  cost: { unit: "call", usd: 0 },
  input: PexelsStockInputSchema,
  output: PexelsStockOutputSchema,

  async execute(params, ctx) {
    const input = PexelsStockInputSchema.parse(params);
    const response = await responseJson<PexelsSearchResponse>(
      await fetch(pexelsSearchUrl(input).toString(), {
        method: "GET",
        headers: {
          Authorization: requiredEnv("PEXELS_API_KEY"),
        },
      }),
      "pexels stock image search",
    );

    const results = (response.photos ?? []).map((photo) => ({
      id: String(photo.id),
      url: photo.src.large,
      thumbnail_url: photo.src.tiny,
      width: photo.width,
      height: photo.height,
      attribution: {
        photographer: photo.photographer,
        photographer_url: photo.photographer_url,
        source_url: photo.url,
        source: PROVIDER,
        license: LICENSE,
      },
    }));

    let imagePath: string | undefined;
    if (input.download_top && results[0]) {
      const bytes = await responseBytes(await fetch(results[0].url), "pexels stock image download");
      imagePath = await writeGeneratedImage(ctx, bytes);
    }

    return PexelsStockOutputSchema.parse({
      results,
      image_path: imagePath,
      provider: PROVIDER,
      cost_usd: 0,
    });
  },
});

function pexelsSearchUrl(input: z.infer<typeof PexelsStockInputSchema>): URL {
  const url = new URL("https://api.pexels.com/v1/search");
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
