import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { fakeComfy, installedModels } from "../comfy/__fixtures__/fake-comfy.js";
import { setComfyClientForTests } from "../comfy/availability.js";
import type { ToolContext } from "../registry/tool.js";
import comfyImage from "./comfy_image.js";
import comfyTextToVideo from "./comfy_text_to_video.js";
import comfyUpscale from "./comfy_upscale.js";
import comfyVideo from "./comfy_video.js";

const PNG_1360x768 = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]),
  Buffer.from("IHDR"),
  Buffer.from([0, 0, 0x05, 0x50, 0, 0, 0x03, 0, 8, 2, 0, 0, 0]),
]);

let root: string;
let messages: string[];
let events: Array<{ event: string; payload: unknown }>;

function context(mode: "interactive" | "non_interactive" = "interactive"): ToolContext {
  return {
    projectRoot: root,
    logger: { info: () => undefined, warn: () => undefined, error: () => undefined, debug: () => undefined, event: () => undefined },
    execution: {
      mode,
      reason: "unit test",
      io: {
        write: (message) => messages.push(message),
        event: (event, payload) => events.push({ event, payload }),
        prompt: () => {
          throw new Error("a local run must never prompt");
        },
      },
    },
  };
}

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), "comfy-tools-"));
  messages = [];
  events = [];
});

afterEach(async () => {
  setComfyClientForTests(undefined);
  await rm(root, { recursive: true, force: true });
});

describe("comfy_image", () => {
  it("announces, queues a Z-Image-Turbo graph, and writes the output into the project at $0", async () => {
    const comfy = fakeComfy({ models: installedModels() });
    setComfyClientForTests(comfy.client);

    const result = await comfyImage.execute({ prompt: "a red bicycle", aspect_ratio: "16:9", seed: 5 }, context());

    expect(messages[0]).toContain("Generating via the `comfy_image` tool (provider: comfyui, model: z-image-turbo-bf16, engine: z-image-turbo)");
    expect(messages[0]).toContain("Estimated cost: $0.00 (local; no provider charge).");
    expect(comfy.state.uploads).toEqual([]);
    expect(comfy.state.queued[0]?.graph.positive?.inputs.text).toBe("a red bicycle");
    expect(result).toMatchObject({ provider: "comfyui", engine: "z-image-turbo", cost_usd: 0, seed: 5, width: 1360, height: 768, mode: "text_to_image" });
    expect(result.image_path.startsWith(join(root, "projects", "_tool_runs", "image"))).toBe(true);
    expect(result.image_path.endsWith(".png")).toBe(true);
    expect(await readFile(result.image_path, "utf8")).toBe("fake-image-bytes");
  });

  it("routes reference images to Qwen-Image-Edit-2511 with the installed 4-step Lightning LoRA", async () => {
    const comfy = fakeComfy({ models: installedModels() });
    setComfyClientForTests(comfy.client);
    await writeFile(join(root, "ref.png"), PNG_1360x768);
    comfy.state.objectInfo.LoadImage = {
      ...comfy.state.objectInfo.LoadImage,
      input: { required: { image: [["show-sidekick/ref.png"], {}] } },
    };

    const result = await comfyImage.execute({ prompt: "make it night", reference_images: ["ref.png"] }, context("non_interactive"));

    expect(comfy.state.uploads).toEqual(["ref.png"]);
    expect(comfy.state.queued[0]?.graph.lora?.inputs.lora_name).toBe("Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors");
    expect(result).toMatchObject({ engine: "qwen-image-edit-2511", mode: "image_edit" });
    expect(events[0]).toMatchObject({ event: "announce", payload: { tool: "comfy_image", estimate_usd: 0, approval: "not_required_local" } });
  });

  it("refuses a requested engine that is not ready instead of substituting another", async () => {
    const comfy = fakeComfy({ models: installedModels() });
    setComfyClientForTests(comfy.client);

    await expect(comfyImage.execute({ prompt: "x", engine: "qwen-image-2.1" }, context())).rejects.toThrow(/qwen-image-2\.1 is not ready/u);
    expect(comfy.state.queued).toEqual([]);
  });

  it("is unavailable, with the fix, when ComfyUI is down", async () => {
    setComfyClientForTests(fakeComfy({ reachable: false }).client);

    await expect(comfyImage.isAvailable()).resolves.toMatchObject({ available: false, fix: "install" });
  });

  it("accepts the generic paid-sample image input shape", () => {
    expect(comfyImage.input.parse({ prompt: "p", model: "gpt-image-2", size: "1024x1024", quality: "low", aspect_ratio: "1:1" })).toEqual({
      prompt: "p",
      size: "1024x1024",
      aspect_ratio: "1:1",
    });
  });
});

describe("comfy_video / comfy_text_to_video", () => {
  it("defaults image-to-video to Wan 2.2 I2V-A14B at 16 fps, 81 frames for 5 s", async () => {
    const comfy = fakeComfy({ models: installedModels(), outputKey: "images", outputFile: { filename: "clip_00001_.mp4", subfolder: "", type: "output" } });
    setComfyClientForTests(comfy.client);
    await writeFile(join(root, "start.png"), PNG_1360x768);

    const result = await comfyVideo.execute({ prompt: "slow push in", image_path: "start.png" }, context());

    expect(result).toMatchObject({ engine: "wan2.2-i2v-a14b", mode: "image_to_video", fps: 16, frames: 81, width: 832, height: 480, cost_usd: 0, has_audio: false });
    expect(result.video_path.endsWith(".mp4")).toBe(true);
    expect(comfy.state.queued[0]?.graph.sample_high?.inputs.steps).toBe(4);
  });

  it("needs a local start image for image-to-video and never fetches remote URLs", async () => {
    setComfyClientForTests(fakeComfy({ models: installedModels() }).client);

    await expect(comfyVideo.execute({ prompt: "x", mode: "image_to_video" }, context())).rejects.toThrow(/needs image_path/u);
    await expect(comfyVideo.execute({ prompt: "x", image_url: "https://example.com/a.png" }, context())).rejects.toThrow(/local image file/u);
  });

  it("serves text-to-video from Wan 2.2 TI2V-5B and rejects image inputs", async () => {
    const comfy = fakeComfy({ models: installedModels(), outputFile: { filename: "clip.mp4", subfolder: "", type: "output" } });
    setComfyClientForTests(comfy.client);

    const result = await comfyTextToVideo.execute({ prompt: "waves", duration: 3 }, context());

    expect(result).toMatchObject({ engine: "wan2.2-ti2v-5b", mode: "text_to_video", fps: 24, frames: 73 });
    await expect(comfyTextToVideo.execute({ prompt: "x", image_path: "start.png" }, context())).rejects.toThrow(/text-to-video only/u);
  });
});

describe("comfy_upscale", () => {
  it("restores a still with SeedVR2 3B at a conservative 2x short edge on the server's own device", async () => {
    const comfy = fakeComfy({ models: installedModels() });
    setComfyClientForTests(comfy.client);
    await writeFile(join(root, "still.png"), PNG_1360x768);

    const result = await comfyUpscale.execute({ source_path: "still.png" }, context());
    const graph = comfy.state.queued[0]?.graph;

    expect(graph?.seedvr2?.inputs).toMatchObject({ resolution: 1536, batch_size: 1, color_correction: "lab" });
    expect(graph?.seedvr2_dit?.inputs).toMatchObject({ model: "seedvr2_ema_3b_fp16.safetensors", device: "mps" });
    expect(result).toMatchObject({ width: 2720, height: 1536, cost_usd: 0, provider_metadata: { engine: "seedvr2-3b" } });
  });

  it("uses the 7B GGUF only when asked for quality, and refuses it when the file is missing", async () => {
    setComfyClientForTests(fakeComfy({ models: installedModels() }).client);
    await writeFile(join(root, "still.png"), PNG_1360x768);

    await expect(comfyUpscale.execute({ source_path: "still.png", quality: true }, context())).rejects.toThrow(
      /seedvr2-7b-q8 is not ready.*seedvr2_ema_7b-Q8_0\.gguf/u,
    );
  });

  it("rejects frame interpolation on a still", async () => {
    setComfyClientForTests(fakeComfy({ models: installedModels() }).client);
    await writeFile(join(root, "still.png"), PNG_1360x768);

    await expect(comfyUpscale.execute({ source_path: "still.png", interpolate: true }, context())).rejects.toThrow(/video sources only/u);
  });
});
