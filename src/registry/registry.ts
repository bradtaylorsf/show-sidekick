import { readdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { DEFAULT_AVAILABILITY_CONCURRENCY, DEFAULT_PROBE_TIMEOUT_MS, withConcurrency, withTimeout } from "./availability.js";
import { NoToolAvailable, RegistryError } from "./errors.js";
import type { Availability, Capability, CliAuth, Integration, Tool, ToolAvailabilityContext } from "./tool.js";

export type RegistryOptions = {
  toolsDir?: string;
  tools?: Tool[];
};

export class Registry {
  private readonly toolsDir: string;
  private readonly tools = new Map<string, Tool>();
  private readonly sourcePaths = new Map<string, string>();
  private readonly discoveryOrder: Tool[] = [];
  private readonly availabilityCache = new Map<string, Availability>();

  constructor(options: RegistryOptions = {}) {
    this.toolsDir = options.toolsDir ?? defaultToolsDir();

    for (const tool of options.tools ?? []) {
      this.register(tool, "<constructor>");
    }
  }

  async discover(): Promise<void> {
    const files = await listToolFiles(this.toolsDir);

    for (const file of files) {
      let imported: unknown;

      try {
        imported = await import(pathToFileURL(file).href);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw new RegistryError("discover-failed", `Failed to import tool ${file}: ${message}`, file);
      }

      const defaultExport = readDefaultExport(imported, file);
      this.register(defaultExport, file);
    }
  }

  get<I = unknown, O = unknown>(name: string): Tool<I, O> | undefined {
    return this.tools.get(name) as Tool<I, O> | undefined;
  }

  byCapability(capability: Capability): Tool[] {
    return this.discoveryOrder.filter((tool) => tool.capability === capability);
  }

  async listByCapability(capability: Capability): Promise<Tool[]> {
    return this.byCapability(capability);
  }

  byProvider(provider: string): Tool[] {
    return this.discoveryOrder.filter((tool) => tool.provider === provider);
  }

  all(): Tool[] {
    return [...this.discoveryOrder];
  }

  getAvailability(name: string): Availability | undefined {
    return this.availabilityCache.get(name);
  }

  async refreshAvailability(
    options: { concurrency?: number; timeoutMs?: number; context?: ToolAvailabilityContext } = {},
  ): Promise<void> {
    const concurrency = options.concurrency ?? DEFAULT_AVAILABILITY_CONCURRENCY;
    const timeoutMs = options.timeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;

    await withConcurrency(this.discoveryOrder, concurrency, async (tool) => {
      try {
        const availability = await withTimeout(tool.isAvailable(options.context), timeoutMs);
        this.availabilityCache.set(tool.name, availability);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.availabilityCache.set(tool.name, { available: false, reason: `probe failed: ${message}` });
      }
    });
  }

  async select(
    capability: Capability,
    prefs: { prefer?: string[]; runtime?: Integration["kind"]; context?: ToolAvailabilityContext } = {},
  ): Promise<Tool> {
    const matchingTools = this.byCapability(capability).filter((tool) => {
      return prefs.runtime === undefined || tool.integration.kind === prefs.runtime;
    });
    const concreteTools = matchingTools.filter((tool) => !isProviderSelectionMarker(tool));
    const candidates = concreteTools.length > 0 ? concreteTools : matchingTools;

    if (prefs.context !== undefined || candidates.some((tool) => !this.availabilityCache.has(tool.name))) {
      await this.refreshAvailability({ context: prefs.context });
    }

    const discoveryIndex = new Map(this.discoveryOrder.map((tool, index) => [tool.name, index]));
    const ranked = [...candidates].sort((left, right) => {
      return (
        preferenceRank(left.name, prefs.prefer) - preferenceRank(right.name, prefs.prefer) ||
        availabilityRank(this.availabilityCache.get(left.name)) - availabilityRank(this.availabilityCache.get(right.name)) ||
        (discoveryIndex.get(left.name) ?? Number.MAX_SAFE_INTEGER) -
          (discoveryIndex.get(right.name) ?? Number.MAX_SAFE_INTEGER)
      );
    });

    const selected = ranked.find((tool) => this.availabilityCache.get(tool.name)?.available === true);

    if (selected) {
      return selected;
    }

    throw new NoToolAvailable(
      capability,
      ranked.map((tool) => ({
        name: tool.name,
        reason: unavailableReason(this.availabilityCache.get(tool.name)),
      })),
    );
  }

  private register(candidate: unknown, sourcePath: string): void {
    const tool = validateToolShape(candidate, sourcePath);
    const existingSource = this.sourcePaths.get(tool.name);

    if (existingSource) {
      throw new RegistryError(
        "duplicate-tool",
        `Duplicate tool name "${tool.name}" in ${sourcePath}; already registered from ${existingSource}`,
        sourcePath,
      );
    }

    this.tools.set(tool.name, tool);
    this.sourcePaths.set(tool.name, sourcePath);
    this.discoveryOrder.push(tool);
  }
}

function preferenceRank(name: string, prefer: string[] | undefined): number {
  const index = prefer?.indexOf(name) ?? -1;
  return index === -1 ? Number.MAX_SAFE_INTEGER : index;
}

function availabilityRank(availability: Availability | undefined): number {
  return availability?.available === true ? 0 : 1;
}

function unavailableReason(availability: Availability | undefined): string {
  if (availability === undefined) {
    return "not probed";
  }

  return availability.available ? "available" : availability.reason;
}

function isProviderSelectionMarker(tool: Tool): boolean {
  return tool.provider === "predit" && (tool.supports ?? []).includes("provider-selection");
}

function defaultToolsDir(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), "../tools");
}

async function listToolFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const absolutePath = join(dir, entry.name);

      if (entry.isDirectory()) {
        await walk(absolutePath);
        continue;
      }

      if (entry.isFile() && isToolModule(entry.name)) {
        files.push(absolutePath);
      }
    }
  }

  await walk(root);
  return files.sort((a, b) => a.localeCompare(b));
}

function isToolModule(name: string): boolean {
  if (!(name.endsWith(".ts") || name.endsWith(".js"))) {
    return false;
  }

  return !name.endsWith(".d.ts") && !name.endsWith(".test.ts") && name !== "index.ts" && name !== "index.js";
}

function readDefaultExport(imported: unknown, sourcePath: string): unknown {
  if (!isRecord(imported) || !("default" in imported)) {
    throw new RegistryError("invalid-tool", `Tool module ${sourcePath} is missing a default export`, sourcePath);
  }

  return imported.default;
}

function validateToolShape(candidate: unknown, sourcePath: string): Tool {
  if (!isRecord(candidate)) {
    invalid(sourcePath, "<root>", "expected default export to be a tool object");
  }

  requireString(candidate, "name", sourcePath);
  requireString(candidate, "capability", sourcePath);
  requireString(candidate, "provider", sourcePath);
  requireStatus(candidate, sourcePath);
  requireIntegration(candidate.integration, sourcePath);
  requireString(candidate, "best_for", sourcePath);
  requireSchema(candidate, "input", sourcePath);
  requireSchema(candidate, "output", sourcePath);
  requireFunction(candidate, "isAvailable", sourcePath);
  requireFunction(candidate, "execute", sourcePath);
  optionalStringArray(candidate, "supports", sourcePath);
  optionalStringArray(candidate, "agent_skills", sourcePath);
  optionalCost(candidate, sourcePath);

  return candidate as unknown as Tool;
}

function requireString(candidate: Record<string, unknown>, field: string, sourcePath: string): void {
  if (typeof candidate[field] !== "string" || candidate[field] === "") {
    invalid(sourcePath, field, "expected non-empty string");
  }
}

function requireStatus(candidate: Record<string, unknown>, sourcePath: string): void {
  if (candidate.status !== "production" && candidate.status !== "beta" && candidate.status !== "experimental") {
    invalid(sourcePath, "status", "expected production, beta, or experimental");
  }
}

function requireIntegration(integration: unknown, sourcePath: string): asserts integration is Integration {
  if (!isRecord(integration)) {
    invalid(sourcePath, "integration", "expected integration object");
  }

  if (integration.kind === "cli") {
    requireString(integration, "binary", sourcePath);
    requireString(integration, "install", sourcePath);
    requireCliAuth(integration.auth, sourcePath);
    return;
  }

  if (integration.kind === "api") {
    requireStringArray(integration, "env", sourcePath);
    requireString(integration, "install", sourcePath);
    return;
  }

  if (integration.kind === "binary") {
    requireString(integration, "binary", sourcePath);
    requireString(integration, "install", sourcePath);
    return;
  }

  if (integration.kind === "library") {
    requireString(integration, "package", sourcePath);
    requireString(integration, "install", sourcePath);
    return;
  }

  invalid(sourcePath, "integration.kind", "expected cli, api, binary, or library");
}

function requireCliAuth(auth: unknown, sourcePath: string): asserts auth is CliAuth {
  if (!isRecord(auth)) {
    invalid(sourcePath, "integration.auth", "expected cli auth object");
  }

  if (auth.mode === "cli-login") {
    if (typeof auth.check !== "string" || auth.check === "") {
      invalid(sourcePath, "integration.auth.check", "expected non-empty string");
    }

    if (auth.timeoutMs !== undefined && typeof auth.timeoutMs !== "number") {
      invalid(sourcePath, "integration.auth.timeoutMs", "expected number");
    }
    return;
  }

  if (auth.mode === "env") {
    requireStringArray(auth, "env", sourcePath);
    return;
  }

  if (auth.mode === "none") {
    return;
  }

  invalid(sourcePath, "integration.auth.mode", "expected cli-login, env, or none");
}

function requireSchema(candidate: Record<string, unknown>, field: string, sourcePath: string): void {
  const schema = candidate[field];

  if (!isRecord(schema) || typeof schema.parse !== "function") {
    invalid(sourcePath, field, "expected Zod schema");
  }
}

function requireFunction(candidate: Record<string, unknown>, field: string, sourcePath: string): void {
  if (typeof candidate[field] !== "function") {
    invalid(sourcePath, field, "expected function");
  }
}

function optionalStringArray(candidate: Record<string, unknown>, field: string, sourcePath: string): void {
  if (candidate[field] !== undefined) {
    requireStringArray(candidate, field, sourcePath);
  }
}

function requireStringArray(candidate: Record<string, unknown>, field: string, sourcePath: string): void {
  const value = candidate[field];

  if (!Array.isArray(value) || value.some((item) => typeof item !== "string" || item === "")) {
    invalid(sourcePath, field, "expected non-empty string array");
  }
}

function optionalCost(candidate: Record<string, unknown>, sourcePath: string): void {
  const cost = candidate.cost;

  if (cost === undefined) {
    return;
  }

  if (!isRecord(cost)) {
    invalid(sourcePath, "cost", "expected cost object");
  }

  if (
    cost.unit !== "clip" &&
    cost.unit !== "second" &&
    cost.unit !== "minute" &&
    cost.unit !== "token" &&
    cost.unit !== "image" &&
    cost.unit !== "call"
  ) {
    invalid(sourcePath, "cost.unit", "expected known cost unit");
  }

  if (typeof cost.usd !== "number") {
    invalid(sourcePath, "cost.usd", "expected number");
  }
}

function invalid(sourcePath: string, field: string, message: string): never {
  throw new RegistryError("invalid-tool", `Invalid tool in ${sourcePath}: ${field} ${message}`, sourcePath);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
