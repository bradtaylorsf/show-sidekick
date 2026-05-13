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
): Tool {
  return defineTool({
    name,
    capability: "tts",
    provider: name,
    status: "beta",
    integration,
    best_for: "select tests",
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
});
