import { Registry } from "./registry.js";
import type { Capability, Tool, ToolContext, ToolLogger } from "./tool.js";

export type ImageGenerateOptions = {
  prompt: string;
  provider?: string;
  size?: string;
  aspect_ratio?: string;
  seed?: number;
  extra?: Record<string, unknown>;
};

type RegistryLike = {
  select(capability: Capability, prefs?: { prefer?: string[]; runtime?: Tool["integration"]["kind"] }): Promise<Tool>;
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

export const imageGen = {
  generate,
};

export async function generate(options: ImageGenerateOptions, ctx: ImageGenContext = defaultContext()): Promise<unknown> {
  const registry = await resolveRegistry(ctx);
  const prefer = options.provider ? resolvePrefer(registry, "image_generation", [options.provider]) : [];
  const tool = await registry.select("image_generation", { prefer });
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
