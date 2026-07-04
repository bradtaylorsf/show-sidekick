import { z } from "zod";
import { responseBytes, responseJson, writeGeneratedImage } from "../media/generated-image.js";
import { defineTool } from "../registry/index.js";
import { BRAVE_SEARCH_COST_USD, braveHeaders } from "./brave-search.js";

const PROVIDER = "brave";
const LICENSE = "Unknown license — verify before publication";

export const BraveImageSearchInputSchema = z.object({
  query: z.string().min(1),
  per_page: z.number().int().min(1).max(100).default(10),
  safesearch: z.enum(["off", "strict"]).default("strict"),
  download_top: z.boolean().default(true),
});

export const BraveImageSearchOutputSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      thumbnail_url: z.string().url().optional(),
      width: z.number().int().positive().optional(),
      height: z.number().int().positive().optional(),
      attribution: z.object({
        source_url: z.string().url(),
        source: z.literal(PROVIDER),
        source_domain: z.string().optional(),
        license: z.literal(LICENSE),
      }),
    }),
  ),
  image_path: z.string().optional(),
  provider: z.literal(PROVIDER),
  cost_usd: z.number(),
});

type BraveImageSearchResponse = {
  results?: Array<{
    title?: string;
    url?: string;
    source?: string;
    thumbnail?: { src?: string };
    properties?: {
      url?: string;
      width?: number;
      height?: number;
    };
  }>;
};

export default defineTool({
  name: "brave_image_search",
  capability: "stock_image",
  provider: PROVIDER,
  status: "beta",
  integration: {
    kind: "api",
    env: ["BRAVE_SEARCH_API_KEY"],
    install: "Set BRAVE_SEARCH_API_KEY to a Brave Search API key from https://api-dashboard.search.brave.com/app/keys.",
  },
  best_for:
    "searching the whole web for topical or niche image assets beyond stock catalogs; results need a license check before publication",
  supports: ["image-search", "source-media", "attribution"],
  cost: { unit: "call", usd: BRAVE_SEARCH_COST_USD },
  input: BraveImageSearchInputSchema,
  output: BraveImageSearchOutputSchema,

  async execute(params, ctx) {
    const input = BraveImageSearchInputSchema.parse(params);
    const response = await responseJson<BraveImageSearchResponse>(
      await fetch(braveImageSearchUrl(input).toString(), {
        method: "GET",
        headers: braveHeaders(),
      }),
      "brave image search",
    );

    const results = (response.results ?? []).flatMap((item) => {
      const imageUrl = item.properties?.url;
      const pageUrl = item.url;
      if (!imageUrl || !pageUrl) {
        return [];
      }

      return [
        {
          title: item.title ?? "",
          url: imageUrl,
          thumbnail_url: item.thumbnail?.src,
          width: item.properties?.width,
          height: item.properties?.height,
          attribution: {
            source_url: pageUrl,
            source: PROVIDER,
            source_domain: item.source,
            license: LICENSE,
          },
        },
      ];
    });

    let imagePath: string | undefined;
    if (input.download_top && results[0]) {
      const bytes = await responseBytes(await fetch(results[0].url), "brave image download");
      imagePath = await writeGeneratedImage(ctx, bytes);
    }

    return BraveImageSearchOutputSchema.parse({
      results,
      image_path: imagePath,
      provider: PROVIDER,
      cost_usd: BRAVE_SEARCH_COST_USD,
    });
  },
});

function braveImageSearchUrl(input: z.infer<typeof BraveImageSearchInputSchema>): URL {
  const url = new URL("https://api.search.brave.com/res/v1/images/search");
  url.searchParams.set("q", input.query);
  url.searchParams.set("count", String(input.per_page));
  url.searchParams.set("safesearch", input.safesearch);

  return url;
}
