import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import type { ToolContext } from "../registry/tool.js";
import clipCache from "./clip_cache.js";

function noopLogger(): ToolContext["logger"] {
  return {
    info: () => undefined,
    warn: () => undefined,
    error: () => undefined,
    debug: () => undefined,
    event: () => undefined,
  };
}

function context(projectRoot: string): ToolContext {
  return { projectRoot, logger: noopLogger() };
}

describe("clip_cache tool", () => {
  it("stores generated clips by identical generation inputs and returns cache hits", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-cache-"));
    const source = join(projectRoot, "generated.mp4");
    await writeFile(source, "fixture video");

    const lookupMiss = await clipCache.execute(
      clipCache.input.parse({
        mode: "lookup",
        prompt: "slow dolly",
        provider: "hunyuan",
        model: "hunyuan-video",
        image_url: "https://cdn.example.com/ref-a.png",
        duration: 5,
        aspect_ratio: "16:9",
      }),
      context(projectRoot),
    );
    expect(lookupMiss).toMatchObject({ hit: false, cache_key: expect.any(String) });

    const stored = await clipCache.execute(
      clipCache.input.parse({
        mode: "store",
        prompt: "slow dolly",
        provider: "hunyuan",
        model: "hunyuan-video",
        image_url: "https://cdn.example.com/ref-a.png",
        duration: 5,
        aspect_ratio: "16:9",
        video_path: source,
      }),
      context(projectRoot),
    );
    expect(stored).toMatchObject({ hit: true, cache_key: lookupMiss.cache_key });
    await expect(readFile(stored.video_path ?? "", "utf8")).resolves.toBe("fixture video");

    const lookupHit = await clipCache.execute(
      clipCache.input.parse({
        mode: "lookup",
        prompt: "slow dolly",
        provider: "hunyuan",
        model: "hunyuan-video",
        image_url: "https://cdn.example.com/ref-a.png",
        duration: 5,
        aspect_ratio: "16:9",
      }),
      context(projectRoot),
    );
    expect(lookupHit).toEqual(stored);
  });

  it("keeps cache keys stable and sensitive to model and input changes", async () => {
    const projectRoot = await mkdtemp(join(tmpdir(), "predit-cache-"));
    const first = await clipCache.execute(
      clipCache.input.parse({
        mode: "lookup",
        prompt: "same prompt",
        provider: "wan",
        model: "wan-2.1",
        image_url: "https://cdn.example.com/ref-a.png",
        duration: 5,
        aspect_ratio: "16:9",
      }),
      context(projectRoot),
    );
    const second = await clipCache.execute(
      clipCache.input.parse({
        mode: "lookup",
        prompt: "same prompt",
        provider: "wan",
        model: "wan-2.1",
        image_url: "https://cdn.example.com/ref-a.png",
        duration: 5,
        aspect_ratio: "16:9",
      }),
      context(projectRoot),
    );
    const differentModel = await clipCache.execute(
      clipCache.input.parse({
        mode: "lookup",
        prompt: "same prompt",
        provider: "wan",
        model: "wan-2.2",
        image_url: "https://cdn.example.com/ref-a.png",
        duration: 5,
        aspect_ratio: "16:9",
      }),
      context(projectRoot),
    );
    const differentImage = await clipCache.execute(
      clipCache.input.parse({
        mode: "lookup",
        prompt: "same prompt",
        provider: "wan",
        model: "wan-2.1",
        image_url: "https://cdn.example.com/ref-b.png",
        duration: 5,
        aspect_ratio: "16:9",
      }),
      context(projectRoot),
    );
    const differentDuration = await clipCache.execute(
      clipCache.input.parse({
        mode: "lookup",
        prompt: "same prompt",
        provider: "wan",
        model: "wan-2.1",
        image_url: "https://cdn.example.com/ref-a.png",
        duration: 10,
        aspect_ratio: "16:9",
      }),
      context(projectRoot),
    );
    const differentAspectRatio = await clipCache.execute(
      clipCache.input.parse({
        mode: "lookup",
        prompt: "same prompt",
        provider: "wan",
        model: "wan-2.1",
        image_url: "https://cdn.example.com/ref-a.png",
        duration: 5,
        aspect_ratio: "9:16",
      }),
      context(projectRoot),
    );

    expect(second.cache_key).toBe(first.cache_key);
    expect(differentModel.cache_key).not.toBe(first.cache_key);
    expect(differentImage.cache_key).not.toBe(first.cache_key);
    expect(differentDuration.cache_key).not.toBe(first.cache_key);
    expect(differentAspectRatio.cache_key).not.toBe(first.cache_key);
  });

  it("requires video_path when storing", () => {
    expect(() => {
      clipCache.input.parse({ mode: "store", prompt: "p", provider: "grok", model: "grok-video-1" });
    }).toThrow();
  });
});
