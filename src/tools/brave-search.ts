import { z } from "zod";
import { responseJson } from "../media/generated-image.js";
import { defineTool } from "../registry/index.js";

const PROVIDER = "brave";

export const BraveSearchInputSchema = z.object({
  query: z.string().min(1),
  count: z.number().int().min(1).max(20).default(10),
  offset: z.number().int().min(0).max(9).default(0),
  freshness: z.enum(["pd", "pw", "pm", "py"]).optional(),
  country: z.string().length(2).optional(),
  safesearch: z.enum(["off", "moderate", "strict"]).default("moderate"),
});

export const BraveSearchOutputSchema = z.object({
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string().url(),
      snippet: z.string(),
      age: z.string().optional(),
    }),
  ),
  provider: z.literal(PROVIDER),
  cost_usd: z.number(),
});

type BraveWebSearchResponse = {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      age?: string;
    }>;
  };
};

export const BRAVE_SEARCH_COST_USD = 0.005;

export default defineTool({
  name: "brave_search",
  capability: "web_search",
  provider: PROVIDER,
  status: "beta",
  integration: {
    kind: "api",
    env: ["BRAVE_SEARCH_API_KEY"],
    install: "Set BRAVE_SEARCH_API_KEY to a Brave Search API key from https://api-dashboard.search.brave.com/app/keys.",
  },
  best_for: "API-backed web search for episode research and context gathering with attributed results",
  supports: ["research", "web-search", "attribution"],
  cost: { unit: "call", usd: BRAVE_SEARCH_COST_USD },
  input: BraveSearchInputSchema,
  output: BraveSearchOutputSchema,

  async execute(params) {
    const input = BraveSearchInputSchema.parse(params);
    const response = await responseJson<BraveWebSearchResponse>(
      await fetch(braveWebSearchUrl(input).toString(), {
        method: "GET",
        headers: braveHeaders(),
      }),
      "brave web search",
    );

    const results = (response.web?.results ?? []).flatMap((item) =>
      item.title && item.url
        ? [
            {
              title: item.title,
              url: item.url,
              snippet: item.description ?? "",
              age: item.age,
            },
          ]
        : [],
    );

    return BraveSearchOutputSchema.parse({
      results,
      provider: PROVIDER,
      cost_usd: BRAVE_SEARCH_COST_USD,
    });
  },
});

function braveWebSearchUrl(input: z.infer<typeof BraveSearchInputSchema>): URL {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", input.query);
  url.searchParams.set("count", String(input.count));
  url.searchParams.set("offset", String(input.offset));
  url.searchParams.set("safesearch", input.safesearch);
  if (input.freshness) {
    url.searchParams.set("freshness", input.freshness);
  }
  if (input.country) {
    url.searchParams.set("country", input.country);
  }

  return url;
}

export function braveHeaders(): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Subscription-Token": requiredBraveEnv(),
  };
}

function requiredBraveEnv(): string {
  const value = process.env.BRAVE_SEARCH_API_KEY;
  if (!value || value.trim() === "") {
    throw new Error("missing env: BRAVE_SEARCH_API_KEY");
  }

  return value;
}
