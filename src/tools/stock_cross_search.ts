import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import type { Capability, Tool, ToolContext } from "../registry/tool.js";
import { isRecord, numberField, stockVideoAttributionSchema, stringField } from "../tool-support/stock-video.js";

const inputSchema = z.object({
  query: z.string().min(1),
  per_source: z.number().int().positive().default(3),
  capabilities: z.array(z.string().min(1)).default(["stock_video", "stock_image"]),
  sources: z.array(z.string().min(1)).optional(),
});

const outputMatchSchema = z.object({
  rank: z.number().int().positive(),
  source_rank: z.number().int().positive(),
  score: z.number(),
  source: z.string().min(1),
  tool: z.string().min(1),
  capability: z.string().min(1),
  video_url: z.string().url().optional(),
  image_url: z.string().url().optional(),
  thumbnail_url: z.string().url().optional(),
  duration: z.number().nonnegative().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  attribution: stockVideoAttributionSchema,
});

const outputSchema = z.object({
  matches: z.array(outputMatchSchema),
  cost_usd: z.number(),
});

type StockCrossSearchInput = z.infer<typeof inputSchema>;
type OutputMatchWithoutRank = Omit<z.infer<typeof outputMatchSchema>, "rank">;

type SourceTool = {
  capability: Capability;
  tool: Tool;
  priority: number;
};

export default defineTool({
  name: "stock_cross_search",
  capability: "stock_cross_search",
  provider: "local",
  status: "beta",
  integration: { kind: "library", package: "node:fetch", install: "built into Node.js" },
  best_for: "Fan-out search across configured stock video and stock image sources with ranked, attributed results.",
  supports: ["stock-video", "stock-image", "cross-source-search"],
  cost: { unit: "call", usd: 0 },
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const sourceTools = await listSourceTools(input, ctx);
    const settled = await Promise.allSettled(sourceTools.map((sourceTool) => searchSourceTool(sourceTool, input, ctx)));
    const matches: OutputMatchWithoutRank[] = [];
    let costUsd = 0;

    settled.forEach((result, index) => {
      const sourceTool = sourceTools[index];

      if (!sourceTool) {
        return;
      }

      if (result.status === "fulfilled") {
        matches.push(...result.value.matches);
        costUsd += result.value.costUsd;
        return;
      }

      const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
      ctx.logger.warn("stock source search failed", { tool: sourceTool.tool.name, error: message });
    });

    const ranked = matches
      .sort((left, right) => right.score - left.score)
      .map((match, index) => ({ ...match, rank: index + 1 }));

    return outputSchema.parse({ matches: ranked, cost_usd: costUsd });
  },
});

async function listSourceTools(input: StockCrossSearchInput, ctx: ToolContext): Promise<SourceTool[]> {
  if (!ctx.registry?.listByCapability) {
    throw new Error("stock source capability listing required (G-6)");
  }

  const requestedSources = input.sources ? new Set(input.sources) : undefined;
  const groups = await Promise.all(
    input.capabilities.map(async (capability) => ({
      capability,
      tools: await ctx.registry?.listByCapability?.(capability),
    })),
  );

  let priority = 0;
  const sourceTools: SourceTool[] = [];

  for (const group of groups) {
    for (const tool of group.tools ?? []) {
      if (requestedSources && !requestedSources.has(tool.name) && !requestedSources.has(tool.provider)) {
        continue;
      }

      const availability = await tool.isAvailable({ projectRoot: ctx.projectRoot });
      if (!availability.available) {
        ctx.logger.warn("stock source unavailable; skipping", { tool: tool.name, reason: availability.reason });
        continue;
      }

      sourceTools.push({ capability: group.capability, tool, priority });
      priority += 1;
    }
  }

  return sourceTools;
}

async function searchSourceTool(
  sourceTool: SourceTool,
  input: StockCrossSearchInput,
  ctx: ToolContext,
): Promise<{ matches: OutputMatchWithoutRank[]; costUsd: number }> {
  const params = sourceTool.tool.input.parse({ query: input.query, per_page: input.per_source });
  const output = await sourceTool.tool.execute(params, ctx);
  const costUsd = isRecord(output) && typeof output.cost_usd === "number" ? output.cost_usd : 0;
  const matches = readOutputMatches(output)
    .slice(0, input.per_source)
    .map((match, index) => normalizeMatch(match, sourceTool, index + 1))
    .filter((match): match is OutputMatchWithoutRank => match !== undefined);

  return { matches, costUsd };
}

function readOutputMatches(output: unknown): Record<string, unknown>[] {
  if (!isRecord(output) || !Array.isArray(output.matches)) {
    return [];
  }

  return output.matches.filter(isRecord);
}

function normalizeMatch(
  match: Record<string, unknown>,
  sourceTool: SourceTool,
  sourceRank: number,
): OutputMatchWithoutRank | undefined {
  const videoUrl = stringField(match, "video_url");
  const imageUrl = stringField(match, "image_url");

  if (!videoUrl && !imageUrl) {
    return undefined;
  }

  const attribution = isRecord(match.attribution)
    ? stockVideoAttributionSchema.parse(match.attribution)
    : { source: sourceTool.tool.provider, license: "Unknown license" };

  return {
    source_rank: sourceRank,
    score: 1_000_000 - sourceTool.priority * 1_000 - sourceRank,
    source: attribution.source,
    tool: sourceTool.tool.name,
    capability: sourceTool.capability,
    video_url: videoUrl,
    image_url: imageUrl,
    thumbnail_url: stringField(match, "thumbnail_url"),
    duration: numberField(match, "duration"),
    width: numberField(match, "width"),
    height: numberField(match, "height"),
    attribution,
  };
}
