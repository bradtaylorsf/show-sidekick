import { Registry } from "./registry.js";
import type { Capability, Tool, ToolContext, ToolLogger } from "./tool.js";

export type ImageHostOptions = {
  prefer?: string[];
};

export type ImageHostOutput = {
  url: string;
  expires_at: string | null;
  cost_usd: number;
  provider: string;
};

type RegistryLike = {
  select(capability: Capability, prefs?: { prefer?: string[]; runtime?: Tool["integration"]["kind"] }): Promise<Tool>;
  byCapability?(capability: Capability): Tool[];
};

type ImageHostContext = ToolContext & {
  registry?: RegistryLike;
};

export const imageHost = {
  host,
};

export async function host(
  localPath: string,
  optionsOrCtx: ImageHostOptions | ImageHostContext = {},
  maybeCtx?: ImageHostContext,
): Promise<ImageHostOutput> {
  const options = isContext(optionsOrCtx) ? {} : optionsOrCtx;
  const ctx = isContext(optionsOrCtx) ? optionsOrCtx : maybeCtx ?? defaultContext();
  const registry = await resolveRegistry(ctx);
  const prefer = resolvePrefer(registry, "image_hosting", options.prefer ?? ["catbox_host"]);
  const tool = await registry.select("image_hosting", { prefer });
  const result = await tool.execute({ local_path: localPath }, ctx);
  return result as ImageHostOutput;
}

async function resolveRegistry(ctx: ImageHostContext): Promise<RegistryLike> {
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

function isContext(value: ImageHostOptions | ImageHostContext): value is ImageHostContext {
  return "projectRoot" in value && "logger" in value;
}

function defaultContext(): ImageHostContext {
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
