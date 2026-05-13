import { Registry } from "./registry.js";
import type { Capability, Tool, ToolContext, ToolLogger } from "./tool.js";

export type ImageGenerateOptions = {
  prompt: string;
  provider?: string;
  source?: "generated" | "stock";
  size?: string;
  aspect_ratio?: string;
  seed?: number;
  count?: number;
  download_top?: boolean;
  extra?: Record<string, unknown>;
};

type RegistryLike = {
  select(
    capability: Capability,
    prefs?: { prefer?: string[]; runtime?: Tool["integration"]["kind"]; context?: Pick<ToolContext, "projectRoot"> },
  ): Promise<Tool>;
  byCapability?(capability: Capability): Tool[];
};

type ImageGenContext = ToolContext & {
  registry?: RegistryLike;
};

type Adapter = (options: ImageGenerateOptions) => Record<string, unknown>;

const adapters: Record<string, Adapter> = {
  openai_image: (options) => withCommon(options, { size: options.size }),
  flux_image: (options) => withCommon(options, { aspect_ratio: options.aspect_ratio, seed: options.seed }),
  google_imagen: (options) => withCommon(options, { aspect_ratio: options.aspect_ratio, seed: options.seed }),
  grok_image: (options) => withCommon(options, { aspect_ratio: options.aspect_ratio }),
  recraft_image: (options) => withCommon(options, { size: options.size }),
};
const defaultPromptToolOrder = ["openai_image", "flux_image", "google_imagen", "grok_image", "recraft_image"];

export const imageGen = {
  generate,
};

export async function generate(options: ImageGenerateOptions, ctx: ImageGenContext = defaultContext()): Promise<unknown> {
  const registry = await resolveRegistry(ctx);
  if (options.source === "stock") {
    const tool = await selectAvailableTool(registry, "stock_image", options.provider);
    return tool.execute(stockAdapter(options), ctx);
  }

  const tool = await selectPromptImageTool(registry, options.provider);
  const adapter = adapters[tool.name] ?? defaultAdapter;
  return tool.execute(adapter(options), ctx);
}

function defaultAdapter(options: ImageGenerateOptions): Record<string, unknown> {
  return withCommon(options, {
    size: options.size,
    aspect_ratio: options.aspect_ratio,
    seed: options.seed,
  });
}

function withCommon(options: ImageGenerateOptions, params: Record<string, unknown>): Record<string, unknown> {
  return {
    prompt: options.prompt,
    ...Object.fromEntries(Object.entries(params).filter((entry): entry is [string, unknown] => entry[1] !== undefined)),
    ...(options.extra ?? {}),
  };
}

function stockAdapter(options: ImageGenerateOptions): Record<string, unknown> {
  return {
    query: options.prompt,
    ...(options.count === undefined ? {} : { per_page: options.count }),
    ...(options.download_top === undefined ? {} : { download_top: options.download_top }),
    ...(options.extra ?? {}),
  };
}

async function selectPromptImageTool(registry: RegistryLike, provider: string | undefined): Promise<Tool> {
  if (!registry.byCapability) {
    const prefer = provider ? resolvePrefer(registry, "image_generation", [provider]) : defaultPromptToolOrder;
    const tool = await registry.select("image_generation", { prefer });
    if (!isPromptImageTool(tool)) {
      throw new Error(`Selected image_generation tool ${tool.name} does not accept prompt-based generation`);
    }
    return tool;
  }

  const tools = registry.byCapability("image_generation");
  const candidates = (provider ? filterByProviderOrName(tools, provider) : tools)
    .filter(isPromptImageTool)
    .sort((left, right) => promptToolRank(left) - promptToolRank(right));

  return firstAvailable("prompt-to-image", candidates);
}

async function selectAvailableTool(registry: RegistryLike, capability: Capability, provider: string | undefined): Promise<Tool> {
  if (!registry.byCapability) {
    const prefer = provider ? resolvePrefer(registry, capability, [provider]) : [];
    return registry.select(capability, { prefer });
  }

  const tools = registry.byCapability(capability);
  const candidates = provider ? filterByProviderOrName(tools, provider) : tools;
  return firstAvailable(capability, candidates);
}

async function firstAvailable(label: string, candidates: Tool[]): Promise<Tool> {
  const reasons: string[] = [];

  for (const tool of candidates) {
    const availability = await tool.isAvailable();
    if (availability.available) {
      return tool;
    }

    reasons.push(`${tool.name}: ${availability.reason}`);
  }

  const detail = reasons.length > 0 ? ` (${reasons.join("; ")})` : "";
  throw new Error(`No ${label} tool available${detail}`);
}

function filterByProviderOrName(tools: Tool[], provider: string): Tool[] {
  return tools.filter((tool) => tool.name === provider || tool.provider === provider);
}

function isPromptImageTool(tool: Tool): boolean {
  return tool.name in adapters || inputHasPromptField(tool);
}

function inputHasPromptField(tool: Tool): boolean {
  const shape = (tool.input as unknown as { shape?: unknown }).shape;
  return typeof shape === "object" && shape !== null && "prompt" in shape;
}

function promptToolRank(tool: Tool): number {
  const index = defaultPromptToolOrder.indexOf(tool.name);
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

async function resolveRegistry(ctx: ImageGenContext): Promise<RegistryLike> {
  if (ctx.registry) {
    return ctx.registry;
  }

  const registry = new Registry();
  await registry.discover();
  return registry;
}

function resolvePrefer(registry: RegistryLike, capability: Capability, prefer: string[]): string[] {
  const byCapability = registry.byCapability;
  if (!byCapability) {
    return prefer;
  }

  return prefer.flatMap((candidate) => {
    const matches = byCapability
      .call(registry, capability)
      .filter((tool) => tool.name === candidate || tool.provider === candidate)
      .map((tool) => tool.name);
    return matches.length > 0 ? matches : [candidate];
  });
}

function defaultContext(): ImageGenContext {
  return {
    projectRoot: process.cwd(),
    logger: noopLogger,
  };
}

const noopLogger: ToolLogger = {
  info: () => undefined,
  warn: () => undefined,
  error: () => undefined,
  debug: () => undefined,
  event: () => undefined,
};
