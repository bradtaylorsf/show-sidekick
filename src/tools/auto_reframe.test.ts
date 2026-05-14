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
      frames: [
        { time_s: 0, faces: [{ x: 780, y: 120, w: 200, h: 260, score: 1 }] },
        { time_s: 1, faces: [{ x: 800, y: 120, w: 200, h: 260, score: 1 }] },
        { time_s: 2, faces: [{ x: 820, y: 120, w: 200, h: 260, score: 1 }] },
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

    expect(registry.select).toHaveBeenCalledWith("face_tracking");
    expect(faceTrackerExecute).toHaveBeenCalledWith({ path: join(projectRoot, "clips", "source.mp4") }, ctx);
    expect(runCli).toHaveBeenCalledWith("ffmpeg", expect.any(Array), { cwd: projectRoot });
    expect(filter).toContain("crop=ih*9/16:ih");
    expect(filter).toContain("min(max(0,900");
    expect(result).toEqual({
      video_path: join(projectRoot, "projects", "_tool_runs", "auto_reframe", "source-9x16.mp4"),
      target_aspect: "9:16",
      cost_usd: 0,
    });
  });

  it("allows source clips outside the project root", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-reframe-"));
    const sourceRoot = await mkdtemp(join(tmpdir(), "predit-source-video-"));
    const sourcePath = join(sourceRoot, "outside.mp4");
    const faceTracker = {
      execute: vi.fn(async () => ({
        frames: [{ time_s: 0, faces: [{ x: 200, y: 40, w: 120, h: 120, score: 1 }] }],
      })),
    } as unknown as Tool;
    const ctx = context(projectRoot, { registry: { select: vi.fn(async () => faceTracker) } });

    await autoReframe.execute(autoReframe.input.parse({ video_path: sourcePath, target_aspect: "9:16" }), ctx);

    const runCli = vi.mocked(ctx.runCli);
    expect(faceTracker.execute).toHaveBeenCalledWith({ path: sourcePath }, ctx);
    expect(runCli.mock.calls[0]?.[1]).toContain(sourcePath);
  });

  it("throws when no face tracker is registered unless center fallback is explicit", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-reframe-"));
    const ctx = context(projectRoot);

    await expect(autoReframe.execute(autoReframe.input.parse({ video_path: "source.mp4", target_aspect: "1:1" }), ctx)).rejects.toThrow(
      "face_tracking capability required",
    );
  });

  it("falls back to a center crop when explicitly allowed", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-reframe-"));
    const ctx = context(projectRoot);

    await autoReframe.execute(
      autoReframe.input.parse({ video_path: "source.mp4", target_aspect: "1:1", allow_center_fallback: true }),
      ctx,
    );
    const runCli = vi.mocked(ctx.runCli);
    const args = runCli.mock.calls[0]?.[1] ?? [];
    const filter = args[args.indexOf("-vf") + 1];

    expect(ctx.logger.warn).toHaveBeenCalledWith(
      "face_tracking capability unavailable; using center crop fallback",
      expect.objectContaining({ error: expect.stringContaining("face_tracking capability required") }),
    );
    expect(filter).toContain("crop=ih*1/1:ih");
    expect(filter).toContain("iw/2");
  });

  it("uses vertical subject tracking when reframing to a landscape target", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-reframe-"));
    const faceTracker = {
      execute: vi.fn(async () => ({
        frames: [{ time_s: 0, faces: [{ x: 200, y: 40, w: 120, h: 120, score: 1 }] }],
      })),
    } as unknown as Tool;
    const registry = { select: vi.fn(async () => faceTracker) };
    const ctx = context(projectRoot, { registry });

    await autoReframe.execute(autoReframe.input.parse({ video_path: "clips/source.mp4", target_aspect: "16:9" }), ctx);
    const runCli = vi.mocked(ctx.runCli);
    const args = runCli.mock.calls[0]?.[1] ?? [];
    const filter = args[args.indexOf("-vf") + 1];

    expect(filter).toContain("crop=iw:iw/16/9");
    expect(filter).toContain("min(max(0,100");
  });

  it("adds the ffmpeg install hint when rendering fails", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-reframe-"));
    const faceTracker = {
      execute: vi.fn(async () => ({
        frames: [{ time_s: 0, faces: [{ x: 200, y: 40, w: 120, h: 120, score: 1 }] }],
      })),
    } as unknown as Tool;
    const ctx = context(projectRoot, {
      registry: { select: vi.fn(async () => faceTracker) },
      runCli: vi.fn(async () => {
        throw new Error("ffmpeg failed: spawn ffmpeg ENOENT");
      }),
    });

    await expect(
      autoReframe.execute(autoReframe.input.parse({ video_path: "clips/source.mp4", target_aspect: "9:16" }), ctx),
    ).rejects.toThrow(/Install: brew install ffmpeg/);
  });
});
