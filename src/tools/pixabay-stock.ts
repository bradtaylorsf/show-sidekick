import { z } from "zod";
import { responseBytes, responseJson, writeGeneratedImage } from "../media/generated-image.js";
import { defineTool } from "../registry/index.js";

const PROVIDER = "pixabay";
const LICENSE = "Pixabay Content License";

export const PixabayStockInputSchema = z.object({
  query: z.string().min(1),
  per_page: z.number().int().min(1).max(80).default(10),
  orientation: z.enum(["landscape", "portrait", "square"]).optional(),
  page: z.number().int().min(1).default(1),
  download_top: z.boolean().default(true),
});

export const PixabayStockOutputSchema = z.object({
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

type PixabaySearchResponse = {
  hits?: Array<{
    id: number | string;
    largeImageURL: string;
    previewURL?: string;
    imageWidth: number;
    imageHeight: number;
    user: string;
    user_id: number | string;
    pageURL: string;
  }>;
};

export default defineTool({
  name: "pixabay_stock",
  capability: "stock_image",
  provider: PROVIDER,
  status: "beta",
  integration: {
    kind: "api",
    env: ["PIXABAY_API_KEY"],
    install: "Set PIXABAY_API_KEY to a Pixabay API key.",
  },
  best_for: "searching Pixabay for broad stock images with attribution metadata",
  supports: ["stock-search", "attribution"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["stock-image-attribution"],
  input: PixabayStockInputSchema,
  output: PixabayStockOutputSchema,

  async execute(params, ctx) {
    const input = PixabayStockInputSchema.parse(params);
    const response = await responseJson<PixabaySearchResponse>(
      await fetch(pixabaySearchUrl(input).toString(), {
        method: "GET",
      }),
      "pixabay stock image search",
    );

    const results = (response.hits ?? []).map((hit) => ({
      id: String(hit.id),
      url: hit.largeImageURL,
      thumbnail_url: hit.previewURL,
      width: hit.imageWidth,
      height: hit.imageHeight,
      attribution: {
        photographer: hit.user,
        photographer_url: `https://pixabay.com/users/${hit.user}-${hit.user_id}`,
        source_url: hit.pageURL,
        source: PROVIDER,
        license: LICENSE,
      },
    }));

    let imagePath: string | undefined;
    if (input.download_top && results[0]) {
      const bytes = await responseBytes(await fetch(results[0].url), "pixabay stock image download");
      imagePath = await writeGeneratedImage(ctx, bytes);
    }

    return PixabayStockOutputSchema.parse({
      results,
      image_path: imagePath,
      provider: PROVIDER,
      cost_usd: 0,
    });
  },
});

function pixabaySearchUrl(input: z.infer<typeof PixabayStockInputSchema>): URL {
  const url = new URL("https://pixabay.com/api/");
  url.searchParams.set("key", requiredEnv("PIXABAY_API_KEY"));
  url.searchParams.set("q", input.query);
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
