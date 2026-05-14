import { randomUUID } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "./define-tool.js";
import { RegistryError } from "./errors.js";
import { Registry } from "./registry.js";
import type { Availability, Tool } from "./tool.js";

const fixtureRoot = resolve(dirname(fileURLToPath(import.meta.url)), "__fixtures__");
let scratchDirs: string[] = [];

function fixture(name: string): string {
  return resolve(fixtureRoot, name);
}

afterEach(async () => {
  await Promise.all(scratchDirs.map((dir) => rm(dir, { recursive: true, force: true })));
  scratchDirs = [];
});

describe("Registry", () => {
  it("discovers tool default exports and supports lookup by name, capability, and provider", async () => {
    const registry = new Registry({ toolsDir: fixture("tools-happy") });

    await registry.discover();

    expect(registry.get("alpha")?.provider).toBe("acme");
    expect(registry.byCapability("tts").map((tool) => tool.name)).toEqual(["alpha", "gamma"]);
    await expect(registry.listByCapability("tts")).resolves.toEqual(registry.byCapability("tts"));
    expect(registry.byProvider("bravo").map((tool) => tool.name)).toEqual(["beta", "gamma"]);
  });

  it("rejects duplicate tool names as a fatal registry error", async () => {
    const registry = new Registry({ toolsDir: fixture("tools-duplicate") });

    try {
      await registry.discover();
      throw new Error("expected discover to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryError);
      expect(error).toMatchObject({ code: "duplicate-tool" });
      expect((error as RegistryError).message).toMatch(/one\.ts.*two\.ts|two\.ts.*one\.ts/);
    }
  });

  it("surfaces import failures as discover-failed", async () => {
    const registry = new Registry({ toolsDir: fixture("tools-import-error") });

    try {
      await registry.discover();
      throw new Error("expected discover to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryError);
      expect(error).toMatchObject({ code: "discover-failed" });
      expect((error as RegistryError).message).toContain("broken.ts");
      expect((error as RegistryError).message).toContain("intentional fixture import failure");
    }
  });

  it("rejects tools missing required fields", async () => {
    const registry = new Registry({ toolsDir: fixture("tools-missing-field") });

    try {
      await registry.discover();
      throw new Error("expected discover to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(RegistryError);
      expect(error).toMatchObject({ code: "invalid-tool" });
      expect((error as RegistryError).message).toContain("capability");
      expect((error as RegistryError).message).toContain("bad.ts");
    }
  });

  it("registers project-scoped tools, tags paid API tools for first-call approval, and skips drafts and tests", async () => {
    const root = await scratchProject();
    await writeProjectTool(root, "custom-video.js", {
      name: "custom_video",
      capability: "image_to_video",
      provider: "custom",
      cost: "{ unit: 'call', usd: 0.4 }",
      integration: "{ kind: 'api', env: ['CUSTOM_KEY'], install: 'set CUSTOM_KEY' }",
    });
    await writeProjectTool(root, "_draft.js", { name: "draft_tool" });
    await writeProjectTool(root, "custom-video.test.js", { name: "test_tool" });
    const registry = new Registry({ tools: [] });

    const registered = await registry.registerProjectTools(root, "show", "episode");

    expect(registered.map((tool) => tool.name)).toEqual(["custom_video"]);
    expect(registry.get("custom_video")).toMatchObject({
      source: "project",
      requires_first_call_approval: true,
      cost: { unit: "call", usd: 0.4 },
    });
    expect(registry.get("draft_tool")).toBeUndefined();
    expect(registry.get("test_tool")).toBeUndefined();
  });

  it("rejects duplicate project tool names", async () => {
    const root = await scratchProject();
    await writeProjectTool(root, "existing.js", { name: "alpha" });
    const registry = new Registry({ tools: [probeTool("alpha", async () => ({ available: true }))] });

    await expect(registry.registerProjectTools(root, "show", "episode")).rejects.toMatchObject({
      code: "duplicate-tool",
    });
  });
});

function probeTool(name: string, probe: () => Promise<Availability>): Tool {
  return defineTool({
    name,
    capability: "tts",
    provider: "fixture",
    status: "beta",
    integration: { kind: "api", env: [`${name.toUpperCase()}_KEY`], install: "n/a" },
    best_for: "tests",
    input: z.object({}),
    output: z.object({}),
    isAvailable: probe,
    execute: async () => ({}),
  });
}

async function scratchProject(): Promise<string> {
  const root = path.join(tmpdir(), `predit-registry-${randomUUID()}`);
  scratchDirs.push(root);
  await mkdir(path.join(root, "projects", "show", "episode", "tools"), { recursive: true });
  return root;
}

async function writeProjectTool(
  root: string,
  fileName: string,
  options: {
    name: string;
    capability?: string;
    provider?: string;
    cost?: string;
    integration?: string;
  },
): Promise<void> {
  const toolDir = path.join(root, "projects", "show", "episode", "tools");
  await writeFile(
    path.join(toolDir, fileName),
    [
      "const schema = { parse(value) { return value; } };",
      "export default {",
      `  name: ${JSON.stringify(options.name)},`,
      `  capability: ${JSON.stringify(options.capability ?? "research")},`,
      `  provider: ${JSON.stringify(options.provider ?? "fixture")},`,
      "  status: 'beta',",
      `  integration: ${options.integration ?? "{ kind: 'library', package: 'fixture', install: 'none' }"},`,
      "  best_for: 'project test tool',",
      ...(options.cost === undefined ? [] : [`  cost: ${options.cost},`]),
      "  input: schema,",
      "  output: schema,",
      "  async isAvailable() { return { available: true }; },",
      "  async execute(params) { return params; },",
      "};",
      "",
    ].join("\n"),
    "utf8",
  );
}

describe("Registry.refreshAvailability", () => {
  it("caps concurrent probes at the configured concurrency", async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const probe = async (): Promise<Availability> => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 20));
      inFlight -= 1;
      return { available: true };
    };

    const tools = Array.from({ length: 20 }, (_, index) => probeTool(`tool-${index}`, probe));
    const registry = new Registry({ tools });

    await registry.refreshAvailability({ concurrency: 4 });

    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(registry.getAvailability("tool-19")).toEqual({ available: true });
  });

  it("caches probes that exceed the per-probe timeout as unavailable", async () => {
    const slow = probeTool(
      "slow",
      () => new Promise<Availability>(() => undefined),
    );
    const fast = probeTool("fast", async () => ({ available: true }));
    const registry = new Registry({ tools: [slow, fast] });

    await registry.refreshAvailability({ timeoutMs: 20 });

    const slowResult = registry.getAvailability("slow");
    expect(slowResult).toMatchObject({ available: false });
    if (slowResult && !slowResult.available) {
      expect(slowResult.reason).toMatch(/probe failed.*timed out/);
    }
    expect(registry.getAvailability("fast")).toEqual({ available: true });
  });
});
