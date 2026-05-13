import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool } from "./define-tool.js";
import { imageHost } from "./image-host.js";
import { Registry } from "./registry.js";

describe("image hosting wrapper", () => {
  it("forwards local_path to the selected image_hosting tool", async () => {
    const execute = vi.fn(async () => ({
      url: "https://example.test/image.png",
      expires_at: null,
      cost_usd: 0,
      provider: "fixture",
    }));
    const isAvailable = vi.fn(async () => ({ available: true as const }));
    const registry = new Registry({
      tools: [
        defineTool({
          name: "fixture_host",
          capability: "image_hosting",
          provider: "fixture",
          status: "beta",
          integration: { kind: "api", env: [], install: "test" },
          best_for: "image host wrapper tests",
          input: z.object({ local_path: z.string() }),
          output: z.object({
            url: z.string(),
            expires_at: z.string().nullable(),
            cost_usd: z.number(),
            provider: z.string(),
          }),
          isAvailable,
          execute,
        }),
      ],
    });

    const result = await imageHost.host("/tmp/local.png", { prefer: ["fixture"] }, testContext(registry));

    expect(isAvailable).toHaveBeenCalledWith(expect.objectContaining({ projectRoot: process.cwd() }));
    expect(execute).toHaveBeenCalledWith({ local_path: "/tmp/local.png" }, expect.objectContaining({ registry }));
    expect(result).toEqual({
      url: "https://example.test/image.png",
      expires_at: null,
      cost_usd: 0,
      provider: "fixture",
    });
  });
});

function testContext(registry: Registry) {
  return {
    projectRoot: process.cwd(),
    registry,
    logger: {
      info: () => undefined,
      warn: () => undefined,
      error: () => undefined,
      debug: () => undefined,
      event: () => undefined,
    },
  };
}
