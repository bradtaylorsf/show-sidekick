import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineTool } from "./define-tool.js";
import { NoToolAvailable } from "./errors.js";
import { Registry } from "./registry.js";
import type { Availability, Integration, Tool } from "./tool.js";

function testTool(
  name: string,
  availability: Availability,
  integration: Integration = { kind: "api", env: [`${name.toUpperCase()}_KEY`], install: "set env" },
  overrides: Partial<Pick<Tool, "provider" | "supports" | "cost">> = {},
): Tool {
  return defineTool({
    name,
    capability: "tts",
    provider: overrides.provider ?? name,
    status: "beta",
    integration,
    best_for: "select tests",
    supports: overrides.supports,
    cost: overrides.cost,
    input: z.object({ text: z.string() }),
    output: z.object({ path: z.string() }),
    isAvailable: async () => availability,
    execute: async (params) => ({ path: params.text }),
  });
}

describe("Registry.select", () => {
  it("orders available candidates by preference list before discovery order", async () => {
    const registry = new Registry({
      tools: [
        testTool("first", { available: true }),
        testTool("second", { available: true }),
        testTool("third", { available: true }),
      ],
    });

    await expect(registry.select("tts", { prefer: ["second", "third"] })).resolves.toMatchObject({ name: "second" });
  });

  it("skips preferred candidates that are unavailable", async () => {
    const registry = new Registry({
      tools: [
        testTool("first", { available: false, reason: "missing env", fix: "env" }),
        testTool("second", { available: true }),
      ],
    });

    await expect(registry.select("tts", { prefer: ["first", "second"] })).resolves.toMatchObject({ name: "second" });
  });

  it("throws NoToolAvailable with cached reasons when no candidate can run", async () => {
    const registry = new Registry({
      tools: [
        testTool("first", { available: false, reason: "missing env", fix: "env" }),
        testTool("second", { available: false, reason: "not-authenticated", fix: "cli-login" }),
      ],
    });

    try {
      await registry.select("tts");
      throw new Error("expected select to reject");
    } catch (error) {
      expect(error).toBeInstanceOf(NoToolAvailable);
      expect(error).toMatchObject({
        capability: "tts",
        reasons: [
          { name: "first", reason: "missing env" },
          { name: "second", reason: "not-authenticated" },
        ],
      });
    }
  });

  it("filters candidates by requested integration runtime", async () => {
    const registry = new Registry({
      tools: [
        testTool("api-tool", { available: true }),
        testTool("cli-tool", { available: true }, { kind: "cli", binary: "node", auth: { mode: "none" }, install: "node" }),
      ],
    });

    await expect(registry.select("tts", { runtime: "cli" })).resolves.toMatchObject({ name: "cli-tool" });
  });

  it("prefers concrete providers over provider-selection markers", async () => {
    const registry = new Registry({
      tools: [
        testTool("tts_selector", { available: true }, undefined, {
          provider: "show-sidekick",
          supports: ["provider-selection"],
        }),
        testTool("concrete-tts", { available: true }),
      ],
    });

    await expect(registry.select("tts")).resolves.toMatchObject({ name: "concrete-tts" });
  });

  it("keeps a provider-selection marker selectable when it is the only provider", async () => {
    const registry = new Registry({
      tools: [
        testTool("tts_selector", { available: true }, undefined, {
          provider: "show-sidekick",
          supports: ["provider-selection"],
        }),
      ],
    });

    await expect(registry.select("tts")).resolves.toMatchObject({ name: "tts_selector" });
  });

  it("prefers an available zero-cost local-default tool over paid providers discovered earlier", async () => {
    const registry = new Registry({
      tools: [
        testTool("paid", { available: true }, undefined, { cost: { unit: "clip", usd: 0.5 } }),
        testTool("local", { available: true }, undefined, { supports: ["local-default"], cost: { unit: "clip", usd: 0 } }),
      ],
    });

    await expect(registry.select("tts")).resolves.toMatchObject({ name: "local" });
  });

  it("falls back to the paid provider when the local-default tool is unavailable", async () => {
    const registry = new Registry({
      tools: [
        testTool("local", { available: false, reason: "ComfyUI not reachable", fix: "install" }, undefined, {
          supports: ["local-default"],
          cost: { unit: "clip", usd: 0 },
        }),
        testTool("paid", { available: true }, undefined, { cost: { unit: "clip", usd: 0.5 } }),
      ],
    });

    await expect(registry.select("tts")).resolves.toMatchObject({ name: "paid" });
  });

  it("lets an explicit preference pick the paid provider over the local default", async () => {
    const registry = new Registry({
      tools: [
        testTool("local", { available: true }, undefined, { supports: ["local-default"], cost: { unit: "clip", usd: 0 } }),
        testTool("paid", { available: true }, undefined, { cost: { unit: "clip", usd: 0.5 } }),
      ],
    });

    await expect(registry.select("tts", { prefer: ["paid"] })).resolves.toMatchObject({ name: "paid" });
  });

  it("never treats a paid tool as local-default even if it carries the tag", async () => {
    const registry = new Registry({
      tools: [
        testTool("first", { available: true }),
        testTool("tagged_paid", { available: true }, undefined, { supports: ["local-default"], cost: { unit: "clip", usd: 1 } }),
      ],
    });

    await expect(registry.select("tts")).resolves.toMatchObject({ name: "first" });
  });
});
