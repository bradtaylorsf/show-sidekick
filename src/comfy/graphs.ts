import type { ComfyGraph, ComfyLink } from "./client.js";
import { MODEL_FILES, type EngineId } from "./models.js";

/**
 * ComfyUI API-format graphs, built in code. Node classes and input names were read
 * from a live server's /object_info and the official workflow templates
 * (comfyui-workflow-templates 0.11.44) on 2026-10-17. Sampler settings follow those
 * templates unless noted.
 */

export const SAVE_NODE_ID = "save";

/** Wan's trained default negative prompt (from the official Wan 2.2 templates). */
export const WAN_DEFAULT_NEGATIVE =
  "色调艳丽，过曝，静态，细节模糊不清，字幕，风格，作品，画作，画面，静止，整体发灰，最差质量，低质量，JPEG压缩残留，丑陋的，残缺的，多余的手指，画得不好的手部，画得不好的脸部，畸形的，毁容的，形态畸形的肢体，手指融合，静止不动的画面，杂乱的背景，三条腿，背景人很多，倒着走";

export const LTX_DEFAULT_NEGATIVE = "pc game, console game, video game, cartoon, childish, ugly";

const LTX_FULL_SIGMAS = "1.0, 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0";
const LTX_REFINE_SIGMAS = "0.85, 0.7250, 0.4219, 0.0";

class GraphBuilder {
  readonly graph: ComfyGraph = {};

  add(id: string, classType: string, inputs: Record<string, unknown>): (index?: number) => ComfyLink {
    if (this.graph[id] !== undefined) {
      throw new Error(`duplicate graph node id ${id}`);
    }
    this.graph[id] = { class_type: classType, inputs };
    return (index = 0) => [id, index];
  }
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------

export type ImageSpeed = "fast" | "balanced" | "quality";

export type ImageGraphInput = {
  engine: Extract<EngineId, "z-image-turbo" | "qwen-image-2.1" | "qwen-image-edit-2511">;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  seed: number;
  speed?: ImageSpeed;
  steps?: number;
  cfg?: number;
  /** Names already uploaded to ComfyUI's input folder. */
  referenceImages?: string[];
  /** Qwen-Image-2.1 edit: references are resized to about resolution x resolution. */
  referenceResolution?: number;
  filenamePrefix: string;
};

export type BuiltGraph = {
  graph: ComfyGraph;
  saveNodeId: string;
  settings: Record<string, unknown>;
};

export function buildImageGraph(input: ImageGraphInput): BuiltGraph {
  switch (input.engine) {
    case "z-image-turbo":
      return buildZImageTurbo(input);
    case "qwen-image-2.1":
      return buildQwenImage21(input);
    case "qwen-image-edit-2511":
      return buildQwenImageEdit2511(input);
  }
}

function buildZImageTurbo(input: ImageGraphInput): BuiltGraph {
  if ((input.referenceImages ?? []).length > 0) {
    throw new Error("z-image-turbo is text-to-image only; use qwen-image-edit-2511 or qwen-image-2.1 for reference images");
  }

  const steps = input.steps ?? 8;
  const cfg = input.cfg ?? 1;
  const g = new GraphBuilder();
  const unet = g.add("unet", "UNETLoader", { unet_name: MODEL_FILES.zImageUnet.filename, weight_dtype: "default" });
  const shift = g.add("shift", "ModelSamplingAuraFlow", { model: unet(), shift: 3 });
  const clip = g.add("clip", "CLIPLoader", { clip_name: MODEL_FILES.zImageTextEncoder.filename, type: "lumina2", device: "default" });
  const vae = g.add("vae", "VAELoader", { vae_name: MODEL_FILES.zImageVae.filename });
  const positive = g.add("positive", "CLIPTextEncode", { clip: clip(), text: input.prompt });
  const negative = g.add("negative", "ConditioningZeroOut", { conditioning: positive() });
  const latent = g.add("latent", "EmptySD3LatentImage", { width: input.width, height: input.height, batch_size: 1 });
  const sample = g.add("sample", "KSampler", {
    model: shift(),
    seed: input.seed,
    steps,
    cfg,
    sampler_name: "res_multistep",
    scheduler: "simple",
    denoise: 1,
    positive: positive(),
    negative: negative(),
    latent_image: latent(),
  });
  const decode = g.add("decode", "VAEDecode", { samples: sample(), vae: vae() });
  g.add(SAVE_NODE_ID, "SaveImage", { images: decode(), filename_prefix: input.filenamePrefix });

  return { graph: g.graph, saveNodeId: SAVE_NODE_ID, settings: { steps, cfg, sampler: "res_multistep", shift: 3 } };
}

function buildQwenImage21(input: ImageGraphInput): BuiltGraph {
  const references = input.referenceImages ?? [];
  if (references.length > 16) {
    throw new Error("qwen-image-2.1 accepts at most 16 reference images");
  }

  const speed = input.speed ?? "fast";
  const turbo = speed !== "quality";
  // Turbo LoRA: 8 steps at cfg 1. Base settings are an unverified starting point
  // (no official 2.1 template ships with ComfyUI 0.11.44 templates).
  const steps = input.steps ?? (turbo ? 8 : 40);
  const cfg = input.cfg ?? (turbo ? 1 : 4);
  const g = new GraphBuilder();
  const unet = g.add("unet", "UNETLoader", { unet_name: MODEL_FILES.qwen21Unet.filename, weight_dtype: "default" });
  const model = turbo
    ? g.add("lora", "LoraLoaderModelOnly", { model: unet(), lora_name: MODEL_FILES.qwen21TurboLora.filename, strength_model: 1 })
    : unet;
  const clip = g.add("clip", "CLIPLoader", { clip_name: MODEL_FILES.qwen21TextEncoder.filename, type: "qwen_image", device: "default" });
  const vae = g.add("vae", "VAELoader", { vae_name: MODEL_FILES.qwen21Vae.filename });
  const encodeInputs: Record<string, unknown> = {
    clip: clip(),
    prompt: input.prompt,
    negative_prompt: input.negativePrompt ?? "",
    vae: vae(),
    resolution: input.referenceResolution ?? 1024,
  };
  references.forEach((name, index) => {
    const load = g.add(`ref_${index + 1}`, "LoadImage", { image: name });
    encodeInputs[`images.image_${index + 1}`] = load();
  });
  const encode = g.add("encode", "TextEncodeQwenImage21", encodeInputs);
  // Edits sample on the latent the encoder sizes to the first reference (any other
  // size shifts the edit); text-to-image uses an empty latent at the asked size.
  const latent =
    references.length > 0
      ? () => encode(2)
      : g.add("latent", "EmptySD3LatentImage", { width: input.width, height: input.height, batch_size: 1 });
  const sample = g.add("sample", "KSampler", {
    model: model(),
    seed: input.seed,
    steps,
    cfg,
    sampler_name: "euler",
    scheduler: "simple",
    denoise: 1,
    positive: encode(0),
    negative: encode(1),
    latent_image: latent(),
  });
  const decode = g.add("decode", "VAEDecode", { samples: sample(), vae: vae() });
  g.add(SAVE_NODE_ID, "SaveImage", { images: decode(), filename_prefix: input.filenamePrefix });

  return {
    graph: g.graph,
    saveNodeId: SAVE_NODE_ID,
    settings: { steps, cfg, sampler: "euler", turbo_lora: turbo, references: references.length },
  };
}

function buildQwenImageEdit2511(input: ImageGraphInput): BuiltGraph {
  const references = input.referenceImages ?? [];
  if (references.length === 0) {
    throw new Error("qwen-image-edit-2511 needs at least one reference image");
  }
  if (references.length > 3) {
    throw new Error("qwen-image-edit-2511 accepts at most 3 reference images");
  }

  const speed = input.speed ?? "fast";
  const lora =
    speed === "fast" ? MODEL_FILES.qwenEditLightning4.filename : speed === "balanced" ? MODEL_FILES.qwenEditLightning8.filename : undefined;
  const steps = input.steps ?? (speed === "fast" ? 4 : speed === "balanced" ? 8 : 40);
  const cfg = input.cfg ?? (lora === undefined ? 3 : 1);
  const g = new GraphBuilder();
  const unet = g.add("unet", "UNETLoader", { unet_name: MODEL_FILES.qwenEditUnet.filename, weight_dtype: "default" });
  const shift = g.add("shift", "ModelSamplingAuraFlow", { model: unet(), shift: 3.1 });
  const norm = g.add("cfg_norm", "CFGNorm", { model: shift(), strength: 1 });
  const model =
    lora === undefined ? norm : g.add("lora", "LoraLoaderModelOnly", { model: norm(), lora_name: lora, strength_model: 1 });
  const clip = g.add("clip", "CLIPLoader", { clip_name: MODEL_FILES.qwenEditTextEncoder.filename, type: "qwen_image", device: "default" });
  const vae = g.add("vae", "VAELoader", { vae_name: MODEL_FILES.qwenEditVae.filename });
  const loads = references.map((name, index) => g.add(`ref_${index + 1}`, "LoadImage", { image: name }));
  const scaled = g.add("ref_scale", "FluxKontextImageScale", { image: loads[0]?.() });
  const imageInputs: Record<string, unknown> = { image1: scaled() };
  loads.slice(1).forEach((load, index) => {
    imageInputs[`image${index + 2}`] = load();
  });
  const positiveRaw = g.add("positive_raw", "TextEncodeQwenImageEditPlus", {
    clip: clip(),
    prompt: input.prompt,
    vae: vae(),
    ...imageInputs,
  });
  const negativeRaw = g.add("negative_raw", "TextEncodeQwenImageEditPlus", {
    clip: clip(),
    prompt: input.negativePrompt ?? "",
    vae: vae(),
    ...imageInputs,
  });
  const positive = g.add("positive", "FluxKontextMultiReferenceLatentMethod", {
    conditioning: positiveRaw(),
    reference_latents_method: "index_timestep_zero",
  });
  const negative = g.add("negative", "FluxKontextMultiReferenceLatentMethod", {
    conditioning: negativeRaw(),
    reference_latents_method: "index_timestep_zero",
  });
  const latent = g.add("latent", "VAEEncode", { pixels: scaled(), vae: vae() });
  const sample = g.add("sample", "KSampler", {
    model: model(),
    seed: input.seed,
    steps,
    cfg,
    sampler_name: "euler",
    scheduler: "simple",
    denoise: 1,
    positive: positive(),
    negative: negative(),
    latent_image: latent(),
  });
  const decode = g.add("decode", "VAEDecode", { samples: sample(), vae: vae() });
  g.add(SAVE_NODE_ID, "SaveImage", { images: decode(), filename_prefix: input.filenamePrefix });

  return {
    graph: g.graph,
    saveNodeId: SAVE_NODE_ID,
    settings: { steps, cfg, sampler: "euler", lightning_lora: lora ?? null, shift: 3.1, references: references.length },
  };
}

// ---------------------------------------------------------------------------
// Video
// ---------------------------------------------------------------------------

export type VideoMode = "image_to_video" | "text_to_video" | "first_last_frame";

export type VideoGraphInput = {
  engine: Extract<EngineId, "wan2.2-ti2v-5b" | "wan2.2-i2v-a14b" | "ltx-2.5">;
  mode: VideoMode;
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  frames: number;
  fps: number;
  seed: number;
  steps?: number;
  cfg?: number;
  startImage?: string;
  endImage?: string;
  /** LTX-2.5 only: run the half-res pass + x2 latent upscaler (needs the upscaler file). */
  ltxUpscale?: boolean;
  filenamePrefix: string;
};

export function buildVideoGraph(input: VideoGraphInput): BuiltGraph {
  if (input.mode !== "text_to_video" && input.startImage === undefined) {
    throw new Error(`${input.mode} needs a start image`);
  }
  if (input.mode === "first_last_frame" && input.endImage === undefined) {
    throw new Error("first_last_frame needs an end image");
  }

  switch (input.engine) {
    case "wan2.2-ti2v-5b":
      return buildWan5b(input);
    case "wan2.2-i2v-a14b":
      return buildWan14b(input);
    case "ltx-2.5":
      return buildLtx25(input);
  }
}

function buildWan5b(input: VideoGraphInput): BuiltGraph {
  if (input.mode === "first_last_frame") {
    throw new Error("wan2.2-ti2v-5b does not do first/last-frame; use wan2.2-i2v-a14b or ltx-2.5");
  }

  const steps = input.steps ?? 20;
  const cfg = input.cfg ?? 5;
  const g = new GraphBuilder();
  const unet = g.add("unet", "UNETLoader", { unet_name: MODEL_FILES.wan5bUnet.filename, weight_dtype: "default" });
  const shift = g.add("shift", "ModelSamplingSD3", { model: unet(), shift: 8 });
  const clip = g.add("clip", "CLIPLoaderGGUF", { clip_name: MODEL_FILES.umt5Gguf.filename, type: "wan" });
  const vae = g.add("vae", "VAELoader", { vae_name: MODEL_FILES.wan22Vae.filename });
  const positive = g.add("positive", "CLIPTextEncode", { clip: clip(), text: input.prompt });
  const negative = g.add("negative", "CLIPTextEncode", { clip: clip(), text: input.negativePrompt ?? WAN_DEFAULT_NEGATIVE });
  const latentInputs: Record<string, unknown> = {
    vae: vae(),
    width: input.width,
    height: input.height,
    length: input.frames,
    batch_size: 1,
  };
  if (input.mode === "image_to_video") {
    latentInputs.start_image = loadScaled(g, "start", input.startImage as string, input.width, input.height)();
  }
  const latent = g.add("latent", "Wan22ImageToVideoLatent", latentInputs);
  const sample = g.add("sample", "KSampler", {
    model: shift(),
    seed: input.seed,
    steps,
    cfg,
    sampler_name: "uni_pc",
    scheduler: "simple",
    denoise: 1,
    positive: positive(),
    negative: negative(),
    latent_image: latent(),
  });
  const decode = g.add("decode", "VAEDecode", { samples: sample(), vae: vae() });
  const video = g.add("video", "CreateVideo", { images: decode(), fps: input.fps });
  g.add(SAVE_NODE_ID, "SaveVideo", { video: video(), filename_prefix: input.filenamePrefix, format: "mp4", codec: "auto" });

  return { graph: g.graph, saveNodeId: SAVE_NODE_ID, settings: { steps, cfg, sampler: "uni_pc", shift: 8 } };
}

function buildWan14b(input: VideoGraphInput): BuiltGraph {
  if (input.mode === "text_to_video") {
    throw new Error("wan2.2-i2v-a14b needs a start image; use wan2.2-ti2v-5b or ltx-2.5 for text-to-video");
  }

  // Seko 4-step LoRAs: two passes of a 4-step schedule, high-noise for steps 0-2,
  // low-noise for steps 2-4, cfg 1, shift 5 (official Wan 2.2 14B i2v template).
  const steps = input.steps ?? 4;
  const split = Math.max(1, Math.floor(steps / 2));
  const cfg = input.cfg ?? 1;
  const g = new GraphBuilder();
  const high = g.add("unet_high", "UnetLoaderGGUF", { unet_name: MODEL_FILES.wan14bHigh.filename });
  const low = g.add("unet_low", "UnetLoaderGGUF", { unet_name: MODEL_FILES.wan14bLow.filename });
  const highLora = g.add("lora_high", "LoraLoaderModelOnly", {
    model: high(),
    lora_name: MODEL_FILES.wan14bSekoHigh.filename,
    strength_model: 1,
  });
  const lowLora = g.add("lora_low", "LoraLoaderModelOnly", {
    model: low(),
    lora_name: MODEL_FILES.wan14bSekoLow.filename,
    strength_model: 1,
  });
  const highModel = g.add("shift_high", "ModelSamplingSD3", { model: highLora(), shift: 5 });
  const lowModel = g.add("shift_low", "ModelSamplingSD3", { model: lowLora(), shift: 5 });
  const clip = g.add("clip", "CLIPLoaderGGUF", { clip_name: MODEL_FILES.umt5Gguf.filename, type: "wan" });
  const vae = g.add("vae", "VAELoader", { vae_name: MODEL_FILES.wan21Vae.filename });
  const positiveText = g.add("positive_text", "CLIPTextEncode", { clip: clip(), text: input.prompt });
  const negativeText = g.add("negative_text", "CLIPTextEncode", { clip: clip(), text: input.negativePrompt ?? WAN_DEFAULT_NEGATIVE });
  const start = loadScaled(g, "start", input.startImage as string, input.width, input.height);
  const conditioningInputs: Record<string, unknown> = {
    positive: positiveText(),
    negative: negativeText(),
    vae: vae(),
    width: input.width,
    height: input.height,
    length: input.frames,
    batch_size: 1,
    start_image: start(),
  };
  if (input.mode === "first_last_frame") {
    conditioningInputs.end_image = loadScaled(g, "end", input.endImage as string, input.width, input.height)();
  }
  const conditioning = g.add(
    "conditioning",
    input.mode === "first_last_frame" ? "WanFirstLastFrameToVideo" : "WanImageToVideo",
    conditioningInputs,
  );
  const first = g.add("sample_high", "KSamplerAdvanced", {
    model: highModel(),
    add_noise: "enable",
    noise_seed: input.seed,
    steps,
    cfg,
    sampler_name: "euler",
    scheduler: "simple",
    positive: conditioning(0),
    negative: conditioning(1),
    latent_image: conditioning(2),
    start_at_step: 0,
    end_at_step: split,
    return_with_leftover_noise: "enable",
  });
  const second = g.add("sample_low", "KSamplerAdvanced", {
    model: lowModel(),
    add_noise: "disable",
    noise_seed: 0,
    steps,
    cfg,
    sampler_name: "euler",
    scheduler: "simple",
    positive: conditioning(0),
    negative: conditioning(1),
    latent_image: first(),
    start_at_step: split,
    end_at_step: 10000,
    return_with_leftover_noise: "disable",
  });
  const decode = g.add("decode", "VAEDecode", { samples: second(), vae: vae() });
  const video = g.add("video", "CreateVideo", { images: decode(), fps: input.fps });
  g.add(SAVE_NODE_ID, "SaveVideo", { video: video(), filename_prefix: input.filenamePrefix, format: "mp4", codec: "auto" });

  return {
    graph: g.graph,
    saveNodeId: SAVE_NODE_ID,
    settings: { steps, split, cfg, sampler: "euler", shift: 5, lora: "seko-v1-4step" },
  };
}

function buildLtx25(input: VideoGraphInput): BuiltGraph {
  // The official first/last-frame template is single-pass; guides do not survive the x2 refine.
  const twoStage = input.ltxUpscale === true && input.mode !== "first_last_frame";
  const cfg = input.cfg ?? 1;
  const g = new GraphBuilder();
  const model = g.add("unet", "UNETLoader", { unet_name: MODEL_FILES.ltxUnet.filename, weight_dtype: "default" });
  const clip = g.add("clip", "CLIPLoader", { clip_name: MODEL_FILES.ltxTextEncoder.filename, type: "ltxv", device: "default" });
  const vae = g.add("vae", "VAELoader", { vae_name: MODEL_FILES.ltxVideoVae.filename });
  const audioVae = g.add("audio_vae", "VAELoader", { vae_name: MODEL_FILES.ltxAudioVae.filename });
  const positiveText = g.add("positive_text", "CLIPTextEncode", { clip: clip(), text: input.prompt });
  const negativeText = g.add("negative_text", "CLIPTextEncode", { clip: clip(), text: input.negativePrompt ?? LTX_DEFAULT_NEGATIVE });
  const conditioned = g.add("conditioning", "LTXVConditioning", {
    positive: positiveText(),
    negative: negativeText(),
    frame_rate: input.fps,
  });

  const stageWidth = twoStage ? Math.round(input.width / 2) : input.width;
  const stageHeight = twoStage ? Math.round(input.height / 2) : input.height;
  const emptyVideo = g.add("empty_video", "EmptyLTXVLatentVideo", {
    width: stageWidth,
    height: stageHeight,
    length: input.frames,
    batch_size: 1,
  });
  const emptyAudio = g.add("empty_audio", "LTXVEmptyLatentAudio", {
    frames_number: input.frames,
    frame_rate: input.fps,
    batch_size: 1,
    audio_vae: audioVae(),
  });

  let positive: ComfyLink = conditioned(0);
  let negative: ComfyLink = conditioned(1);
  let videoLatent: ComfyLink = emptyVideo();
  let start: ((index?: number) => ComfyLink) | undefined;

  if (input.mode === "image_to_video") {
    start = g.add("start_prep", "LTXVPreprocess", {
      image: loadScaled(g, "start", input.startImage as string, input.width, input.height)(),
      img_compression: 18,
    });
    videoLatent = g.add("start_inplace", "LTXVImgToVideoInplace", {
      vae: vae(),
      image: start(),
      latent: videoLatent,
      strength: twoStage ? 0.7 : 1,
      bypass: false,
    })();
  } else if (input.mode === "first_last_frame") {
    const first = g.add("start_prep", "LTXVPreprocess", {
      image: loadScaled(g, "start", input.startImage as string, stageWidth, stageHeight)(),
      img_compression: 18,
    });
    const last = g.add("end_prep", "LTXVPreprocess", {
      image: loadScaled(g, "end", input.endImage as string, stageWidth, stageHeight)(),
      img_compression: 18,
    });
    const firstGuide = g.add("guide_first", "LTXVAddGuide", {
      positive,
      negative,
      vae: vae(),
      latent: videoLatent,
      image: first(),
      frame_idx: 0,
      strength: 0.7,
    });
    const lastGuide = g.add("guide_last", "LTXVAddGuide", {
      positive: firstGuide(0),
      negative: firstGuide(1),
      vae: vae(),
      latent: firstGuide(2),
      image: last(),
      frame_idx: -1,
      strength: 0.7,
    });
    positive = lastGuide(0);
    negative = lastGuide(1);
    videoLatent = lastGuide(2);
  }

  const guider = g.add("guider", "LTXVDualCFGGuider", { model: model(), positive, negative, video_cfg: cfg, audio_cfg: cfg });
  const sampler = g.add("sampler", "KSamplerSelect", { sampler_name: "euler_ancestral" });
  const noise = g.add("noise", "RandomNoise", { noise_seed: input.seed });
  const sigmas = g.add("sigmas", "ManualSigmas", { sigmas: LTX_FULL_SIGMAS });
  const avLatent = g.add("av_latent", "LTXVConcatAVLatent", { video_latent: videoLatent, audio_latent: emptyAudio() });
  const firstPass = g.add("sample", "SamplerCustomAdvanced", {
    noise: noise(),
    guider: guider(),
    sampler: sampler(),
    sigmas: sigmas(),
    latent_image: avLatent(),
  });
  const separated = g.add("separate", "LTXVSeparateAVLatent", { av_latent: firstPass(0) });

  let finalVideo: ComfyLink = separated(0);
  let finalAudio: ComfyLink = separated(1);

  if (input.mode === "first_last_frame") {
    finalVideo = g.add("crop_guides", "LTXVCropGuides", { positive, negative, latent: separated(0) })(2);
  }

  if (twoStage) {
    const upscaler = g.add("upscaler", "LatentUpscaleModelLoader", { model_name: MODEL_FILES.ltxSpatialUpscaler.filename });
    let upsampled: ComfyLink = g.add("upsample", "LTXVLatentUpsampler", {
      samples: finalVideo,
      upscale_model: upscaler(),
      vae: vae(),
    })();
    if (start !== undefined) {
      upsampled = g.add("refine_inplace", "LTXVImgToVideoInplace", {
        vae: vae(),
        image: start(),
        latent: upsampled,
        strength: 1,
        bypass: false,
      })();
    }
    const refineLatent = g.add("refine_latent", "LTXVConcatAVLatent", { video_latent: upsampled, audio_latent: finalAudio });
    const refineNoise = g.add("refine_noise", "RandomNoise", { noise_seed: 42 });
    const refineSigmas = g.add("refine_sigmas", "ManualSigmas", { sigmas: LTX_REFINE_SIGMAS });
    const refineGuider = g.add("refine_guider", "LTXVDualCFGGuider", {
      model: model(),
      positive,
      negative,
      video_cfg: cfg,
      audio_cfg: cfg,
    });
    const refine = g.add("refine", "SamplerCustomAdvanced", {
      noise: refineNoise(),
      guider: refineGuider(),
      sampler: sampler(),
      sigmas: refineSigmas(),
      latent_image: refineLatent(),
    });
    const refined = g.add("refine_separate", "LTXVSeparateAVLatent", { av_latent: refine(0) });
    finalVideo = refined(0);
    finalAudio = refined(1);
  }

  const decode = g.add("decode", "VAEDecodeTiled", {
    samples: finalVideo,
    vae: vae(),
    tile_size: 512,
    overlap: 64,
    temporal_size: 64,
    temporal_overlap: 16,
  });
  const audio = g.add("decode_audio", "LTXVAudioVAEDecode", { samples: finalAudio, audio_vae: audioVae() });
  const video = g.add("video", "CreateVideo", { images: decode(), fps: input.fps, audio: audio() });
  g.add(SAVE_NODE_ID, "SaveVideo", { video: video(), filename_prefix: input.filenamePrefix, format: "mp4", codec: "auto" });

  return {
    graph: g.graph,
    saveNodeId: SAVE_NODE_ID,
    settings: { cfg, sampler: "euler_ancestral", two_stage: twoStage, sigmas: LTX_FULL_SIGMAS, audio: true },
  };
}

function loadScaled(g: GraphBuilder, prefix: string, image: string, width: number, height: number): (index?: number) => ComfyLink {
  const load = g.add(`${prefix}_image`, "LoadImage", { image });
  return g.add(`${prefix}_scale`, "ImageScale", {
    image: load(),
    upscale_method: "lanczos",
    width,
    height,
    crop: "center",
  });
}

// ---------------------------------------------------------------------------
// Upscale / restore / interpolate
// ---------------------------------------------------------------------------

export type SeedVr2Engine = Extract<EngineId, "seedvr2-3b" | "seedvr2-7b-q8">;

export type SeedVr2Settings = {
  engine: SeedVr2Engine;
  /** Target short edge in pixels after restore. */
  resolution: number;
  maxResolution?: number;
  /** Scale applied before restore (e.g. 0.5): SeedVR2 restores cleaner from a softer input. */
  preDownscale?: number;
  seed: number;
  device: string;
  colorCorrection?: "lab" | "wavelet" | "wavelet_adaptive" | "hsv" | "adain" | "none";
  batchSize?: number;
  temporalOverlap?: number;
};

export type UpscaleImageGraphInput = SeedVr2Settings & { image: string; filenamePrefix: string };

export function seedvr2DitFile(engine: SeedVr2Engine): string {
  return engine === "seedvr2-7b-q8" ? MODEL_FILES.seedvr2Dit7bQ8.filename : MODEL_FILES.seedvr2Dit3b.filename;
}

export function buildUpscaleImageGraph(input: UpscaleImageGraphInput): BuiltGraph {
  const g = new GraphBuilder();
  const load = g.add("source", "LoadImage", { image: input.image });
  const restored = addSeedVr2(g, load, { ...input, batchSize: 1 });
  g.add(SAVE_NODE_ID, "SaveImage", { images: restored(), filename_prefix: input.filenamePrefix });

  return { graph: g.graph, saveNodeId: SAVE_NODE_ID, settings: seedVr2SettingsSummary(input, 1) };
}

export type UpscaleVideoGraphInput = {
  video: string;
  seedvr2?: SeedVr2Settings;
  interpolate?: { multiplier: number };
  filenamePrefix: string;
};

export function buildUpscaleVideoGraph(input: UpscaleVideoGraphInput): BuiltGraph {
  if (input.seedvr2 === undefined && input.interpolate === undefined) {
    throw new Error("video upscale needs SeedVR2 settings, interpolation, or both");
  }

  const g = new GraphBuilder();
  const load = g.add("source", "LoadVideo", { file: input.video });
  const components = g.add("components", "GetVideoComponents", { video: load() });
  let frames: (index?: number) => ComfyLink = () => components(0);

  if (input.seedvr2 !== undefined) {
    frames = addSeedVr2(g, frames, input.seedvr2);
  }

  let fps: ComfyLink = components(2);
  if (input.interpolate !== undefined) {
    const interpolated = g.add("interpolate", "RIFE VFI", {
      ckpt_name: "rife47.pth",
      frames: frames(),
      clear_cache_after_n_frames: 10,
      multiplier: input.interpolate.multiplier,
      fast_mode: true,
      ensemble: true,
      scale_factor: 1,
      dtype: "float32",
      torch_compile: false,
      batch_size: 1,
    });
    frames = interpolated;
    fps = g.add("fps", "ComfyMathExpression", {
      expression: `a * ${input.interpolate.multiplier}`,
      "values.a": components(2),
    })(0);
  }

  const video = g.add("video", "CreateVideo", { images: frames(), fps, audio: components(1) });
  g.add(SAVE_NODE_ID, "SaveVideo", { video: video(), filename_prefix: input.filenamePrefix, format: "mp4", codec: "auto" });

  return {
    graph: g.graph,
    saveNodeId: SAVE_NODE_ID,
    settings: {
      ...(input.seedvr2 === undefined ? {} : seedVr2SettingsSummary(input.seedvr2, input.seedvr2.batchSize ?? 5)),
      ...(input.interpolate === undefined ? {} : { interpolation: "rife47", multiplier: input.interpolate.multiplier }),
    },
  };
}

function addSeedVr2(
  g: GraphBuilder,
  source: (index?: number) => ComfyLink,
  settings: SeedVr2Settings,
): (index?: number) => ComfyLink {
  let input = source;
  if (settings.preDownscale !== undefined && settings.preDownscale !== 1) {
    input = g.add("pre_downscale", "ImageScaleBy", { image: source(), upscale_method: "area", scale_by: settings.preDownscale });
  }

  const dit = g.add("seedvr2_dit", "SeedVR2LoadDiTModel", {
    model: seedvr2DitFile(settings.engine),
    device: settings.device,
    attention_mode: "sdpa",
  });
  const vae = g.add("seedvr2_vae", "SeedVR2LoadVAEModel", { model: MODEL_FILES.seedvr2Vae.filename, device: settings.device });
  return g.add("seedvr2", "SeedVR2VideoUpscaler", {
    image: input(),
    dit: dit(),
    vae: vae(),
    seed: settings.seed,
    resolution: evenInt(settings.resolution),
    max_resolution: evenInt(settings.maxResolution ?? 0),
    batch_size: settings.batchSize ?? 5,
    uniform_batch_size: false,
    color_correction: settings.colorCorrection ?? "lab",
    temporal_overlap: settings.temporalOverlap ?? 0,
  });
}

function seedVr2SettingsSummary(settings: SeedVr2Settings, batchSize: number): Record<string, unknown> {
  return {
    dit: seedvr2DitFile(settings.engine),
    resolution: evenInt(settings.resolution),
    pre_downscale: settings.preDownscale ?? 1,
    color_correction: settings.colorCorrection ?? "lab",
    batch_size: batchSize,
    device: settings.device,
  };
}

function evenInt(value: number): number {
  const rounded = Math.round(value);
  return rounded % 2 === 0 ? rounded : rounded + 1;
}

/** Every node class a built graph uses — checked against /object_info before queueing. */
export function graphClassTypes(graph: ComfyGraph): string[] {
  return [...new Set(Object.values(graph).map((node) => node.class_type))].sort();
}

/** Every model file name a graph references (for the Mac fp8 guard and announcements). */
export function graphModelFiles(graph: ComfyGraph): string[] {
  const keys = new Set(["unet_name", "clip_name", "vae_name", "lora_name", "model_name", "ckpt_name", "model"]);
  const names = new Set<string>();
  for (const node of Object.values(graph)) {
    for (const [key, value] of Object.entries(node.inputs)) {
      if (keys.has(key) && typeof value === "string" && /\.(safetensors|gguf|pth|ckpt)$/u.test(value)) {
        names.add(value);
      }
    }
  }
  return [...names].sort();
}
