import { describe, expect, it } from "vitest";
import { fixtureObjectInfo } from "./__fixtures__/fake-comfy.js";
import {
  buildImageGraph,
  buildUpscaleImageGraph,
  buildUpscaleVideoGraph,
  buildVideoGraph,
  graphModelFiles,
  type BuiltGraph,
} from "./graphs.js";
import { validateGraph } from "./validate.js";

const objectInfo = fixtureObjectInfo();
const base = { prompt: "a lighthouse at dusk", seed: 7, filenamePrefix: "show-sidekick/test" };

function expectValid(built: BuiltGraph): void {
  const validation = validateGraph(built.graph, objectInfo);
  expect(validation.errors).toEqual([]);
  // Anything ComfyUI did not list must be a model file or an input image, never a structural value.
  for (const issue of validation.missingFiles) {
    expect(["unet_name", "clip_name", "vae_name", "lora_name", "model_name", "model", "image", "file"]).toContain(issue.input);
  }
}

describe("image graphs", () => {
  it("builds Z-Image-Turbo text-to-image with the template's 8-step res_multistep settings", () => {
    const built = buildImageGraph({ ...base, engine: "z-image-turbo", width: 1024, height: 576 });

    expectValid(built);
    expect(built.graph.clip?.inputs).toMatchObject({ clip_name: "qwen_3_4b.safetensors", type: "lumina2" });
    expect(built.graph.sample?.inputs).toMatchObject({ steps: 8, cfg: 1, sampler_name: "res_multistep", scheduler: "simple" });
    expect(built.graph.latent?.inputs).toMatchObject({ width: 1024, height: 576 });
    expect(() => buildImageGraph({ ...base, engine: "z-image-turbo", width: 1, height: 1, referenceImages: ["a.png"] })).toThrow(
      /text-to-image only/u,
    );
  });

  it("builds Qwen-Image-Edit-2511 edits with the Lightning LoRA chosen by speed", () => {
    const fast = buildImageGraph({ ...base, engine: "qwen-image-edit-2511", width: 0, height: 0, referenceImages: ["ref-a.png"] });
    const balanced = buildImageGraph({
      ...base,
      engine: "qwen-image-edit-2511",
      width: 0,
      height: 0,
      speed: "balanced",
      referenceImages: ["ref-a.png", "ref-b.png", "ref-c.png"],
    });
    const quality = buildImageGraph({ ...base, engine: "qwen-image-edit-2511", width: 0, height: 0, speed: "quality", referenceImages: ["ref-a.png"] });

    for (const built of [fast, balanced, quality]) {
      expectValid(built);
    }
    expect(fast.graph.lora?.inputs.lora_name).toBe("Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors");
    expect(fast.graph.sample?.inputs).toMatchObject({ steps: 4, cfg: 1 });
    expect(balanced.graph.lora?.inputs.lora_name).toBe("Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors");
    expect(balanced.graph.positive_raw?.inputs).toHaveProperty("image3");
    expect(quality.graph.lora).toBeUndefined();
    expect(quality.graph.sample?.inputs).toMatchObject({ steps: 40, cfg: 3 });
    expect(fast.graph.positive?.inputs.reference_latents_method).toBe("index_timestep_zero");
    expect(() =>
      buildImageGraph({ ...base, engine: "qwen-image-edit-2511", width: 0, height: 0, referenceImages: ["a", "b", "c", "d"] }),
    ).toThrow(/at most 3/u);
    expect(() => buildImageGraph({ ...base, engine: "qwen-image-edit-2511", width: 0, height: 0 })).toThrow(/at least one reference/u);
  });

  it("builds Qwen-Image-2.1 text-to-image and multi-reference edits", () => {
    const t2i = buildImageGraph({ ...base, engine: "qwen-image-2.1", width: 1344, height: 768 });
    const edit = buildImageGraph({
      ...base,
      engine: "qwen-image-2.1",
      width: 0,
      height: 0,
      speed: "quality",
      referenceImages: ["ref-a.png", "ref-b.png"],
    });

    expectValid(t2i);
    expectValid(edit);
    expect(t2i.graph.lora?.inputs.lora_name).toBe("qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors");
    expect(t2i.graph.sample?.inputs).toMatchObject({ steps: 8, cfg: 1, latent_image: ["latent", 0] });
    expect(t2i.graph.clip?.inputs).toMatchObject({ clip_name: "qwen3vl_8b_bf16.safetensors", type: "qwen_image" });
    expect(edit.graph.encode?.inputs).toMatchObject({ "images.image_1": ["ref_1", 0], "images.image_2": ["ref_2", 0] });
    expect(edit.graph.sample?.inputs.latent_image).toEqual(["encode", 2]);
    expect(edit.graph.lora).toBeUndefined();
  });
});

describe("video graphs", () => {
  it("builds Wan 2.2 TI2V-5B text- and image-to-video on the 2.2 VAE", () => {
    const t2v = buildVideoGraph({ ...base, engine: "wan2.2-ti2v-5b", mode: "text_to_video", width: 1280, height: 704, frames: 121, fps: 24 });
    const i2v = buildVideoGraph({
      ...base,
      engine: "wan2.2-ti2v-5b",
      mode: "image_to_video",
      width: 1280,
      height: 704,
      frames: 121,
      fps: 24,
      startImage: "ref-a.png",
    });

    expectValid(t2v);
    expectValid(i2v);
    expect(t2v.graph.vae?.inputs.vae_name).toBe("wan2.2_vae.safetensors");
    expect(t2v.graph.clip).toMatchObject({ class_type: "CLIPLoaderGGUF", inputs: { clip_name: "umt5-xxl-encoder-Q8_0.gguf", type: "wan" } });
    expect(t2v.graph.latent?.inputs).not.toHaveProperty("start_image");
    expect(i2v.graph.latent?.inputs.start_image).toEqual(["start_scale", 0]);
  });

  it("builds Wan 2.2 I2V-A14B with GGUF high/low experts, Seko LoRAs, a split 4-step schedule, and the 2.1 VAE", () => {
    const i2v = buildVideoGraph({
      ...base,
      engine: "wan2.2-i2v-a14b",
      mode: "image_to_video",
      width: 832,
      height: 480,
      frames: 81,
      fps: 16,
      startImage: "ref-a.png",
    });
    const flf = buildVideoGraph({
      ...base,
      engine: "wan2.2-i2v-a14b",
      mode: "first_last_frame",
      width: 832,
      height: 480,
      frames: 81,
      fps: 16,
      startImage: "ref-a.png",
      endImage: "ref-b.png",
    });

    expectValid(i2v);
    expectValid(flf);
    expect(i2v.graph.unet_high).toMatchObject({ class_type: "UnetLoaderGGUF", inputs: { unet_name: "Wan2.2-I2V-A14B-HighNoise-Q8_0.gguf" } });
    expect(i2v.graph.lora_low?.inputs.lora_name).toBe("Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1-low_noise.safetensors");
    expect(i2v.graph.vae?.inputs.vae_name).toBe("wan_2.1_vae.safetensors");
    expect(i2v.graph.sample_high?.inputs).toMatchObject({ steps: 4, cfg: 1, start_at_step: 0, end_at_step: 2, add_noise: "enable" });
    expect(i2v.graph.sample_low?.inputs).toMatchObject({ start_at_step: 2, add_noise: "disable", latent_image: ["sample_high", 0] });
    expect(flf.graph.conditioning).toMatchObject({ class_type: "WanFirstLastFrameToVideo" });
    expect(() => buildVideoGraph({ ...base, engine: "wan2.2-i2v-a14b", mode: "text_to_video", width: 832, height: 480, frames: 81, fps: 16 })).toThrow(
      /needs a start image/u,
    );
  });

  it("builds LTX-2.5 with native audio, the two-stage x2 latent upscale, and single-pass first/last frame", () => {
    const twoStage = buildVideoGraph({
      ...base,
      engine: "ltx-2.5",
      mode: "image_to_video",
      width: 1280,
      height: 704,
      frames: 121,
      fps: 24,
      startImage: "ref-a.png",
      ltxUpscale: true,
    });
    const t2v = buildVideoGraph({ ...base, engine: "ltx-2.5", mode: "text_to_video", width: 768, height: 448, frames: 121, fps: 24 });
    const flf = buildVideoGraph({
      ...base,
      engine: "ltx-2.5",
      mode: "first_last_frame",
      width: 768,
      height: 448,
      frames: 121,
      fps: 24,
      startImage: "ref-a.png",
      endImage: "ref-b.png",
      ltxUpscale: true,
    });

    for (const built of [twoStage, t2v, flf]) {
      expectValid(built);
      expect(built.graph.video?.inputs.audio).toEqual(["decode_audio", 0]);
    }
    expect(twoStage.graph.empty_video?.inputs).toMatchObject({ width: 640, height: 352, length: 121 });
    expect(twoStage.graph.upsample).toMatchObject({ class_type: "LTXVLatentUpsampler" });
    expect(twoStage.graph.refine_sigmas?.inputs.sigmas).toBe("0.85, 0.7250, 0.4219, 0.0");
    expect(twoStage.graph.clip?.inputs).toMatchObject({ clip_name: "gemma4-12b-with-proj-ltx-2.5-bf16.safetensors", type: "ltxv" });
    expect(t2v.graph.upsample).toBeUndefined();
    expect(t2v.graph.start_inplace).toBeUndefined();
    expect(flf.graph.upsample).toBeUndefined();
    expect(flf.graph.guide_last?.inputs.frame_idx).toBe(-1);
  });
});

describe("upscale graphs", () => {
  it("restores a still with SeedVR2 after an optional downscale", () => {
    const built = buildUpscaleImageGraph({
      engine: "seedvr2-3b",
      image: "ref-a.png",
      resolution: 1537,
      preDownscale: 0.5,
      seed: 42,
      device: "mps",
      filenamePrefix: "x",
    });

    expectValid(built);
    expect(built.graph.pre_downscale?.inputs).toMatchObject({ scale_by: 0.5 });
    expect(built.graph.seedvr2?.inputs).toMatchObject({ resolution: 1538, batch_size: 1, color_correction: "lab", image: ["pre_downscale", 0] });
    expect(built.graph.seedvr2_dit?.inputs).toMatchObject({ model: "seedvr2_ema_3b_fp16.safetensors", device: "mps" });
  });

  it("chains SeedVR2 and RIFE on video and scales the frame rate with the multiplier", () => {
    const built = buildUpscaleVideoGraph({
      video: "clip.mp4",
      seedvr2: { engine: "seedvr2-7b-q8", resolution: 1080, seed: 42, device: "mps" },
      interpolate: { multiplier: 2 },
      filenamePrefix: "x",
    });
    const rifeOnly = buildUpscaleVideoGraph({ video: "clip.mp4", interpolate: { multiplier: 3 }, filenamePrefix: "x" });

    expectValid(built);
    expectValid(rifeOnly);
    expect(built.graph.seedvr2_dit?.inputs.model).toBe("seedvr2_ema_7b-Q8_0.gguf");
    expect(built.graph.interpolate?.inputs).toMatchObject({ ckpt_name: "rife47.pth", multiplier: 2, frames: ["seedvr2", 0] });
    expect(built.graph.fps?.inputs).toMatchObject({ expression: "a * 2", "values.a": ["components", 2] });
    expect(built.graph.video?.inputs).toMatchObject({ fps: ["fps", 0], audio: ["components", 1] });
    expect(rifeOnly.graph.seedvr2).toBeUndefined();
    expect(() => buildUpscaleVideoGraph({ video: "clip.mp4", filenamePrefix: "x" })).toThrow(/needs SeedVR2 settings/u);
  });
});

describe("Mac weight rules", () => {
  it("never references fp8 or int8_convrot weights in any default graph", () => {
    const graphs = [
      buildImageGraph({ ...base, engine: "z-image-turbo", width: 1024, height: 1024 }),
      buildImageGraph({ ...base, engine: "qwen-image-edit-2511", width: 0, height: 0, referenceImages: ["a"] }),
      buildImageGraph({ ...base, engine: "qwen-image-2.1", width: 1024, height: 1024 }),
      buildVideoGraph({ ...base, engine: "wan2.2-ti2v-5b", mode: "text_to_video", width: 1280, height: 704, frames: 121, fps: 24 }),
      buildVideoGraph({ ...base, engine: "wan2.2-i2v-a14b", mode: "image_to_video", width: 832, height: 480, frames: 81, fps: 16, startImage: "a" }),
      buildVideoGraph({ ...base, engine: "ltx-2.5", mode: "text_to_video", width: 1280, height: 704, frames: 121, fps: 24, ltxUpscale: true }),
    ];

    for (const built of graphs) {
      for (const file of graphModelFiles(built.graph)) {
        expect(file).not.toMatch(/fp8|e4m3|e5m2|int8|int4|nvfp4/iu);
      }
      for (const node of Object.values(built.graph)) {
        if ("weight_dtype" in node.inputs) {
          expect(node.inputs.weight_dtype).toBe("default");
        }
      }
    }
  });
});
