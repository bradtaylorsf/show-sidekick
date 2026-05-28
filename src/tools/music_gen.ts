import { z } from "zod";
import { defineTool } from "../registry/define-tool.js";
import type { Tool, ToolContext } from "../registry/tool.js";
import { isRecord, musicGenInputSchema, musicMatchSchema } from "../tool-support/music-provider.js";

const inputSchema = musicGenInputSchema.extend({
  prefer: z.array(z.string().min(1)).optional(),
  exclude: z.array(z.string().min(1)).optional(),
});

const outputMatchSchema = z
  .object({
    tool: z.string().min(1),
    provider: z.string().min(1),
    audio_path: z.string().min(1).optional(),
    provider_request_id: z.string().optional(),
  })
  .merge(musicMatchSchema.partial());

const outputSchema = z.object({
  matches: z.array(outputMatchSchema),
  cost_usd: z.number(),
});

type MusicGenSelectorInput = z.infer<typeof inputSchema>;
type MusicGenSelectorOutput = z.infer<typeof outputSchema>;

export default defineTool({
  name: "music_gen",
  capability: "music_generation",
  provider: "local",
  status: "beta",
  integration: { kind: "library", package: "node:fetch", install: "built into Node.js" },
  best_for: "Selector wrapper that routes music generation/search to the first configured provider.",
  supports: ["music-generation-selector", "registry-routing"],
  cost: { unit: "call", usd: 0 },
  agent_skills: ["music"],
  input: inputSchema,
  output: outputSchema,
  async execute(params, ctx) {
    const input = inputSchema.parse(params);
    const tools = await listMusicProviders(ctx);
    const selected = await firstAvailableTool(rankTools(filterTools(tools, input), input), ctx);

    if (!selected) {
      throw new Error(
        "No available music_generation provider; use bundled/skills/meta/music-plan.md to choose inputs/show-slug/episode-slug/ or configure Suno/Freesound/Pixabay.",
      );
    }

    const output = await selected.execute(adaptParams(selected, input), ctx);
    return outputSchema.parse(normalizeOutput(selected, output));
  },
});

async function listMusicProviders(ctx: ToolContext): Promise<Tool[]> {
  if (!ctx.registry?.listByCapability) {
    throw new Error("music_gen requires ctx.registry.listByCapability");
  }

  const [generation, search] = await Promise.all([
    ctx.registry.listByCapability("music_generation"),
    ctx.registry.listByCapability("music_search"),
  ]);
  return [...generation, ...search];
}

function filterTools(tools: Tool[], input: MusicGenSelectorInput): Tool[] {
  const excluded = new Set(["music_gen", ...(input.exclude ?? [])]);
  return tools.filter((tool) => !excluded.has(tool.name));
}

function rankTools(tools: Tool[], input: MusicGenSelectorInput): Tool[] {
  return [...tools].sort((left, right) => preferenceRank(left.name, input.prefer) - preferenceRank(right.name, input.prefer));
}

async function firstAvailableTool(tools: Tool[], ctx: ToolContext): Promise<Tool | undefined> {
  const availability = await Promise.all(tools.map((tool) => tool.isAvailable({ projectRoot: ctx.projectRoot })));
  return tools.find((_tool, index) => availability[index]?.available === true);
}

function preferenceRank(name: string, prefer: string[] | undefined): number {
  const index = prefer?.indexOf(name) ?? -1;
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function adaptParams(tool: Tool, input: MusicGenSelectorInput): unknown {
  const direct = tool.input.safeParse(input);

  if (direct.success) {
    return direct.data;
  }

  return tool.input.parse({
    query: input.prompt,
    per_page: 5,
    max_duration: input.duration,
    mood: input.mood,
  });
}

function normalizeOutput(tool: Tool, output: unknown): MusicGenSelectorOutput {
  if (!isRecord(output)) {
    return { matches: [], cost_usd: 0 };
  }

  const costUsd = typeof output.cost_usd === "number" ? output.cost_usd : 0;
  const audioPath = typeof output.audio_path === "string" ? output.audio_path : undefined;

  if (audioPath) {
    return {
      matches: [
        {
          tool: tool.name,
          provider: tool.provider,
          audio_path: audioPath,
          provider_request_id: typeof output.provider_request_id === "string" ? output.provider_request_id : undefined,
        },
      ],
      cost_usd: costUsd,
    };
  }

  if (!Array.isArray(output.matches)) {
    return { matches: [], cost_usd: costUsd };
  }

  return {
    matches: output.matches.filter(isRecord).map((match) => ({
      ...match,
      tool: tool.name,
      provider: tool.provider,
    })),
    cost_usd: costUsd,
  };
}
