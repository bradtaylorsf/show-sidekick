import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AwaitingHuman } from "../announce/index.js";
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

  it("announces non-zero-cost tool execution before running the implementation", async () => {
    vi.stubEnv("SAMPLE_KEY", "present");
    const events: Array<{ event: string; payload: unknown }> = [];
    const calls: string[] = [];
    const tool = defineTool({
      name: "paid-video",
      capability: "image_to_video",
      provider: "video-provider",
      status: "beta",
      integration: { kind: "api", env: ["SAMPLE_KEY"], install: "noop" },
      best_for: "video generation",
      cost: { unit: "clip", usd: 0.25 },
      input: z.object({ prompt: z.string() }),
      output: z.object({ path: z.string() }),
      execute: async (params) => {
        calls.push("execute");
        return { path: params.prompt };
      },
    });

    await expect(
      tool.execute(
        { prompt: "hero" },
        {
          projectRoot: "/tmp/predit",
          logger: logger(),
          execution: {
            mode: { json: true },
            reason: "approved sample render",
            units: 2,
            io: {
              event: (event, payload) => {
                events.push({ event, payload });
                calls.push(event);
              },
            },
          },
        },
      ),
    ).resolves.toEqual({ path: "hero" });

    expect(calls).toEqual(["announce", "execute"]);
    expect(events).toEqual([
      {
        event: "announce",
        payload: expect.objectContaining({
          tool: "paid-video",
          provider: "video-provider",
          estimate_usd: 0.5,
        }),
      },
    ]);
  });

  it("fires first-paid-call approval for paid project API tools before announce and execution", async () => {
    vi.stubEnv("SAMPLE_KEY", "present");
    const calls: string[] = [];
    const tool = defineTool({
      name: "custom-paid-video",
      capability: "image_to_video",
      provider: "custom",
      source: "project",
      requires_first_call_approval: true,
      status: "beta",
      integration: { kind: "api", env: ["SAMPLE_KEY"], install: "noop" },
      best_for: "custom project video generation",
      cost: { unit: "clip", usd: 0.25 },
      input: z.object({ prompt: z.string() }),
      output: z.object({ path: z.string() }),
      execute: async (params) => {
        calls.push("execute");
        return { path: params.prompt };
      },
    });

    await expect(
      tool.execute(
        { prompt: "hero" },
        {
          projectRoot: "/tmp/predit",
          logger: logger(),
          execution: {
            mode: { json: true },
            io: {
              event: (event) => calls.push(event),
            },
            firstPaidCallApproval: async ({ tool: approvedTool }) => {
              calls.push(`approve:${approvedTool.name}`);
            },
          },
        },
      ),
    ).resolves.toEqual({ path: "hero" });

    expect(calls).toEqual(["approve:custom-paid-video", "announce", "execute"]);
  });

  it("requires a first-paid-call approval hook for paid project API tools", async () => {
    const tool = defineTool({
      name: "custom-paid-video",
      capability: "image_to_video",
      provider: "custom",
      source: "project",
      requires_first_call_approval: true,
      status: "beta",
      integration: { kind: "api", env: [], install: "noop" },
      best_for: "custom project video generation",
      cost: { unit: "clip", usd: 0.25 },
      input: z.object({ prompt: z.string() }),
      output: z.object({ path: z.string() }),
      execute: async (params) => ({ path: params.prompt }),
    });

    await expect(
      tool.execute(
        { prompt: "hero" },
        {
          projectRoot: "/tmp/predit",
          logger: logger(),
          execution: { mode: { json: true }, io: { event: () => undefined } },
        },
      ),
    ).rejects.toBeInstanceOf(AwaitingHuman);
  });

  it("blocks motion-runtime fallback before paid execution", async () => {
    let executed = false;
    const tool = defineTool({
      name: "paid-video",
      capability: "image_to_video",
      provider: "video-provider",
      status: "beta",
      integration: { kind: "api", env: ["SAMPLE_KEY"], install: "noop" },
      best_for: "video generation",
      cost: { unit: "clip", usd: 0.25 },
      input: z.object({ prompt: z.string() }),
      output: z.object({ path: z.string() }),
      execute: async (params) => {
        executed = true;
        return { path: params.prompt };
      },
    });

    await expect(
      tool.execute(
        { prompt: "hero" },
        {
          projectRoot: "/tmp/predit",
          logger: logger(),
          execution: {
            mode: { json: true },
            io: { event: () => undefined },
            motionGuardrail: {
              deliveryPromise: { motion_led: true },
              lockedRuntime: "hyperframes",
              availableRuntimes: ["remotion"],
              attemptedRuntime: "remotion",
            },
          },
        },
      ),
    ).rejects.toBeInstanceOf(AwaitingHuman);
    expect(executed).toBe(false);
  });
});

function logger() {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}
