import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import type { Tool, ToolContext } from "../registry/tool.js";
import autoReframe from "./auto_reframe.js";

function logger(): ToolContext["logger"] {
  return {
    info: () => undefined,
    warn: vi.fn(),
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

function context(projectRoot: string, overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    projectRoot,
    logger: logger(),
    runCli: vi.fn(async () => ({ stdout: "", stderr: "" })),
    ...overrides,
  };
}

describe("auto_reframe tool", () => {
  it("uses face tracking to build a smart ffmpeg crop for vertical output", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-reframe-"));
    const faceTrackerExecute = vi.fn(async () => ({
      track: [
        { frame: 0, bbox: { x: 780, y: 120, width: 200, height: 260 } },
        { frame: 1, bbox: { x: 800, y: 120, width: 200, height: 260 } },
        { frame: 2, bbox: { x: 820, y: 120, width: 200, height: 260 } },
      ],
    }));
    const faceTracker = { execute: faceTrackerExecute } as unknown as Tool;
    const registry = { select: vi.fn(async () => faceTracker) };
    const ctx = context(projectRoot, { registry });

    const result = await autoReframe.execute(
      autoReframe.input.parse({ video_path: "clips/source.mp4", target_aspect: "9:16" }),
      ctx,
    );
    const runCli = vi.mocked(ctx.runCli);
    const args = runCli.mock.calls[0]?.[1] ?? [];
    const filter = args[args.indexOf("-vf") + 1];

    expect(registry.select).toHaveBeenCalledWith("face_tracker");
    expect(faceTrackerExecute).toHaveBeenCalledWith({ video_path: join(projectRoot, "clips", "source.mp4") }, ctx);
    expect(runCli).toHaveBeenCalledWith("ffmpeg", expect.any(Array), { cwd: projectRoot });
    expect(filter).toContain("crop=ih*9/16:ih");
    expect(filter).toContain("min(max(0,900");
    expect(result).toEqual({
      video_path: join(projectRoot, "projects", "_tool_runs", "auto_reframe", "source-9x16.mp4"),
      target_aspect: "9:16",
      cost_usd: 0,
    });
  });

  it("falls back to a center crop when no face tracker is registered", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-reframe-"));
    const ctx = context(projectRoot);

    await autoReframe.execute(autoReframe.input.parse({ video_path: "source.mp4", target_aspect: "1:1" }), ctx);
    const runCli = vi.mocked(ctx.runCli);
    const args = runCli.mock.calls[0]?.[1] ?? [];
    const filter = args[args.indexOf("-vf") + 1];

    expect(ctx.logger.warn).toHaveBeenCalledWith("face_tracker capability unavailable; using center crop fallback");
    expect(filter).toContain("crop=ih*1/1:ih");
    expect(filter).toContain("iw/2");
  });
});
