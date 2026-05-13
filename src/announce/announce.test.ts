import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { DecisionEntry } from "../artifacts/decision-log.js";
import type { Tool, ToolContext } from "../registry/tool.js";
import { AbortedByUser, AwaitingHuman, announceBeforeExecute, detectMajorChange, enforceMotionGuardrail, requireApproval } from "./index.js";

const ctx: ToolContext = {
  projectRoot: process.cwd(),
  logger: {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  },
};

describe("announceBeforeExecute", () => {
  it("bypasses announce for zero-cost tools", async () => {
    let calls = 0;
    const writes: string[] = [];
    const tool = makeTool({
      cost: { unit: "call", usd: 0 },
      execute: async () => {
        calls += 1;
        return "ok";
      },
    });

    await expect(
      announceBeforeExecute({
        tool,
        params: { model: "free-model", units: 1 },
        ctx,
        reason: "test zero-cost path",
        io: { write: (message) => writes.push(message), prompt: () => false },
      }),
    ).resolves.toBe("ok");

    expect(calls).toBe(1);
    expect(writes).toEqual([]);
  });

  it("prints an interactive announce block and proceeds after approval", async () => {
    const writes: string[] = [];
    const prompts: string[] = [];
    const tool = makeTool();

    const result = await announceBeforeExecute({
      tool,
      params: { model: "kling-v2.1-pro", units: 3, mode: "sample" },
      ctx,
      reason: "hero clips need image-to-video generation",
      io: {
        write: (message) => writes.push(message),
        prompt: (message) => {
          prompts.push(message);
          return true;
        },
      },
    });

    expect(result).toBe("ok");
    expect(writes[0]).toContain("`video-gen`");
    expect(writes[0]).toContain("provider: test-provider");
    expect(writes[0]).toContain("model: kling-v2.1-pro");
    expect(writes[0]).toContain("Estimated cost: $1.50");
    expect(prompts).toEqual(["Proceed? [y/N] "]);
  });

  it("emits an announce NDJSON event in non-interactive mode and proceeds", async () => {
    const events: Array<{ event: string; payload: unknown }> = [];
    const tool = makeTool();

    await expect(
      announceBeforeExecute({
        tool,
        params: { model: "batch-model", units: 2 },
        ctx,
        reason: "batch render approved",
        mode: { json: true },
        io: {
          event: (event, payload) => events.push({ event, payload }),
          prompt: () => {
            throw new Error("prompt should not be called");
          },
        },
      }),
    ).resolves.toBe("ok");

    expect(events).toEqual([
      {
        event: "announce",
        payload: expect.objectContaining({
          tool: "video-gen",
          provider: "test-provider",
          model: "batch-model",
          sample_or_batch: "batch",
          estimate_usd: 1,
        }),
      },
    ]);
  });

  it("aborts before execution when the user declines", async () => {
    let calls = 0;
    const tool = makeTool({
      execute: async () => {
        calls += 1;
        return "ok";
      },
    });

    await expect(
      announceBeforeExecute({
        tool,
        params: { units: 1 },
        ctx,
        reason: "declined spend",
        io: { write: () => undefined, prompt: () => false },
      }),
    ).rejects.toBeInstanceOf(AbortedByUser);
    expect(calls).toBe(0);
  });
});

describe("major-change gate", () => {
  it("detects every major change category", () => {
    expect(detectMajorChange({ previous: { provider: "a" }, next: { provider: "b" } })).toBe("provider_swap");
    expect(detectMajorChange({ previous: { model: "a" }, next: { model: "b" } })).toBe("model_swap");
    expect(detectMajorChange({ previous: { runtime: "remotion" }, next: { runtime: "hyperframes" } })).toBe("runtime_swap");
    expect(detectMajorChange({ previous: { narrationPresent: true }, next: { narrationPresent: false } })).toBe(
      "narration_dropped",
    );
    expect(detectMajorChange({ previous: { musicPresent: true }, next: { musicPresent: false } })).toBe("music_dropped");
    expect(detectMajorChange({ previous: { sampleOrBatch: "sample" }, next: { sampleOrBatch: "batch" } })).toBe(
      "sample_to_batch",
    );
    expect(detectMajorChange({ previous: { provider: "a" }, next: { provider: "a" } })).toBe("none");
  });

  it("records a superseding decision with the mapped category after approval", async () => {
    const entries: DecisionEntry[] = [];
    const previous = decision({ id: "provider-proposal", category: "provider_selection", picked: "flux" });

    const entry = await requireApproval("provider_swap", {
      previous: { provider: "flux" },
      next: { provider: "imagen" },
      decisionLog: [previous],
      mode: "interactive",
      io: { write: () => undefined, prompt: () => true },
      timestamp: "2026-05-13T12:00:00Z",
      id: "provider-assets-approved",
      recordDecision: async (decisionEntry) => {
        entries.push(decisionEntry);
        return entries;
      },
    });

    expect(entry).toMatchObject({
      id: "provider-assets-approved",
      category: "provider_selection",
      picked: "imagen",
      supersedes: "provider-proposal",
    });
    expect(entries).toEqual([entry]);
  });

  it("escalates instead of approving major changes in non-interactive mode", async () => {
    const events: Array<{ event: string; payload: unknown }> = [];

    await expect(
      requireApproval("runtime_swap", {
        previous: { runtime: "hyperframes" },
        next: { runtime: "remotion" },
        mode: { json: true },
        io: { event: (event, payload) => events.push({ event, payload }) },
      }),
    ).rejects.toBeInstanceOf(AwaitingHuman);

    expect(events).toEqual([
      {
        event: "awaiting_human",
        payload: expect.objectContaining({
          type: "provider_access",
          recommendation: expect.stringContaining("record the superseding decision"),
        }),
      },
    ]);
  });
});

describe("motion guardrail", () => {
  it("raises a blocker before attempting a fallback runtime for locked motion-led work", async () => {
    const events: Array<{ event: string; payload: unknown }> = [];

    await expect(
      enforceMotionGuardrail({
        deliveryPromise: { motion_led: true },
        lockedRuntime: "hyperframes",
        availableRuntimes: ["remotion"],
        attemptedRuntime: "remotion",
        mode: { json: true },
        io: { event: (event, payload) => events.push({ event, payload }) },
      }),
    ).rejects.toBeInstanceOf(AwaitingHuman);

    expect(events[0]).toEqual({
      event: "awaiting_human",
      payload: expect.objectContaining({
        type: "provider_access",
        recommendation: expect.stringContaining("wait and retry hyperframes"),
      }),
    });
  });
});

function makeTool(overrides: Partial<Tool<Record<string, unknown>, string>> = {}): Tool<Record<string, unknown>, string> {
  return {
    name: "video-gen",
    capability: "image_to_video",
    provider: "test-provider",
    status: "production",
    integration: { kind: "api", env: [], install: "configured in tests" },
    best_for: "tests",
    cost: { unit: "clip", usd: 0.5 },
    input: z.record(z.unknown()),
    output: z.string(),
    isAvailable: async () => ({ available: true }),
    execute: async () => "ok",
    ...overrides,
  };
}

function decision(overrides: Partial<DecisionEntry> = {}): DecisionEntry {
  return {
    id: "runtime-proposal",
    stage: "proposal",
    timestamp: "2026-05-13T10:00:00Z",
    category: "render_runtime_selection",
    options_considered: [
      { label: "remotion", rejected_because: null },
      { label: "hyperframes", rejected_because: null },
    ],
    picked: "remotion",
    reason: "Remotion matched the approved proposal.",
    confidence: 0.8,
    user_visible: true,
    supersedes: null,
    ...overrides,
  };
}
