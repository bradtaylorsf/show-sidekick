import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { defineTool } from "./define-tool.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("defineTool", () => {
  it("returns the same object reference while filling the default integration availability probe", async () => {
    vi.stubEnv("PREDIT_DEFINE_TOOL_SAMPLE_KEY", "");
    const definition = {
      name: "sample",
      capability: "tts",
      provider: "sample",
      status: "beta",
      integration: { kind: "api", env: ["PREDIT_DEFINE_TOOL_SAMPLE_KEY"], install: "noop" },
      best_for: "test fixtures",
      input: z.object({ text: z.string() }),
      output: z.object({ url: z.string() }),
      execute: async (params: { text: string }) => ({ url: params.text }),
    } as const;

    const tool = defineTool(definition);

    expect(tool).toBe(definition);
    await expect(tool.isAvailable()).resolves.toEqual({
      available: false,
      reason: "missing env: PREDIT_DEFINE_TOOL_SAMPLE_KEY",
      fix: "env",
    });
  });

  it("uses schema-inferred input and output at runtime", async () => {
    const tool = defineTool({
      name: "sample-typed",
      capability: "tts",
      provider: "sample",
      status: "beta",
      integration: { kind: "api", env: ["SAMPLE_KEY"], install: "noop" },
      best_for: "type inference fixtures",
      input: z.object({ text: z.string() }),
      output: z.object({ url: z.string() }),
      execute: async (params) => ({ url: params.text }),
    });

    await expect(
      tool.execute(
        { text: "voiceover" },
        {
          projectRoot: "/tmp/predit",
          logger: {
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
            debug: () => undefined,
            event: () => undefined,
          },
        },
      ),
    ).resolves.toEqual({ url: "voiceover" });
  });
});
