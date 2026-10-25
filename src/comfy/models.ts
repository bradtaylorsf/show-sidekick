/**
 * The local ComfyUI engines Show Sidekick knows how to drive, and the exact model
 * files each one needs. Every file here is bf16/fp16 or GGUF on purpose: fp8
 * weights have no Float8 kernels on Apple Silicon (MPS), and the `int8_convrot`
 * Comfy builds are unverified on MPS, so neither is ever a default.
 *
 * Sizes and repo paths were read from the Hugging Face file trees on 2026-10-17.
 */

export type ComfyToolKind = "image" | "video" | "upscale";

export type LicenceId = "apache-2.0" | "qwen-research" | "ltx-2-community";

export type LicenceInfo = {
  id: LicenceId;
  label: string;
  commercial: "yes" | "restricted" | "no";
  summary: string;
  url: string;
};

export const LICENCES: Record<LicenceId, LicenceInfo> = {
  "apache-2.0": {
    id: "apache-2.0",
    label: "Apache-2.0",
    commercial: "yes",
    summary: "Permissive; commercial use allowed.",
    url: "https://www.apache.org/licenses/LICENSE-2.0",
  },
  "qwen-research": {
    id: "qwen-research",
    label: "Qwen research licence",
    commercial: "no",
    summary: "Research / non-commercial licence (model card lists `qwen-research`). Do not use outputs commercially without checking the licence.",
    url: "https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE",
  },
  "ltx-2-community": {
    id: "ltx-2-community",
    label: "LTX-2.x community licence",
    commercial: "restricted",
    summary: "Community licence: free for entities under $10M annual revenue; larger entities need a commercial licence. Gated: accept it on Hugging Face first.",
    url: "https://github.com/Lightricks/LTX-2/blob/main/LICENSE-2_x",
  },
};

export type ModelFile = {
  /** File name as ComfyUI lists it. */
  filename: string;
  /** Folder under ComfyUI's `models/` directory the file must live in. */
  folder: string;
  /** Server folder keys checked through `GET /models/<key>` (GGUF loaders register their own keys). */
  apiFolders: string[];
  repo: string;
  repoPath: string;
  sizeGb: number;
  gated?: boolean;
};

export function hfUrl(file: ModelFile): string {
  return `https://huggingface.co/${file.repo}/resolve/main/${file.repoPath}`;
}

const f = (file: ModelFile): ModelFile => file;

export const MODEL_FILES = {
  qwen21Unet: f({
    filename: "qwen_image_2.1_bf16.safetensors",
    folder: "diffusion_models",
    apiFolders: ["diffusion_models"],
    repo: "Comfy-Org/Qwen-Image-2.1",
    repoPath: "diffusion_models/qwen_image_2.1_bf16.safetensors",
    sizeGb: 14.23,
  }),
  qwen21TurboLora: f({
    filename: "qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors",
    folder: "loras",
    apiFolders: ["loras"],
    repo: "Comfy-Org/Qwen-Image-2.1",
    repoPath: "loras/qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors",
    sizeGb: 0.91,
  }),
  qwen21TextEncoder: f({
    filename: "qwen3vl_8b_bf16.safetensors",
    folder: "text_encoders",
    apiFolders: ["text_encoders"],
    repo: "Comfy-Org/Qwen-Image-2.1",
    repoPath: "text_encoders/qwen3vl_8b_bf16.safetensors",
    sizeGb: 17.53,
  }),
  qwen21Vae: f({
    filename: "qwen_image_2.1_vae_bf16.safetensors",
    folder: "vae",
    apiFolders: ["vae"],
    repo: "Comfy-Org/Qwen-Image-2.1",
    repoPath: "vae/qwen_image_2.1_vae_bf16.safetensors",
    sizeGb: 0.68,
  }),
  qwenEditUnet: f({
    filename: "qwen_image_edit_2511_bf16.safetensors",
    folder: "diffusion_models",
    apiFolders: ["diffusion_models"],
    repo: "Comfy-Org/Qwen-Image-Edit_ComfyUI",
    repoPath: "split_files/diffusion_models/qwen_image_edit_2511_bf16.safetensors",
    sizeGb: 40.86,
  }),
  qwenEditLightning4: f({
    filename: "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
    folder: "loras",
    apiFolders: ["loras"],
    repo: "lightx2v/Qwen-Image-Edit-2511-Lightning",
    repoPath: "Qwen-Image-Edit-2511-Lightning-4steps-V1.0-bf16.safetensors",
    sizeGb: 0.85,
  }),
  qwenEditLightning8: f({
    filename: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
    folder: "loras",
    apiFolders: ["loras"],
    repo: "lightx2v/Qwen-Image-Edit-2511-Lightning",
    repoPath: "Qwen-Image-Edit-2511-Lightning-8steps-V1.0-bf16.safetensors",
    sizeGb: 0.85,
  }),
  qwenEditTextEncoder: f({
    filename: "qwen_2.5_vl_7b.safetensors",
    folder: "text_encoders",
    apiFolders: ["text_encoders"],
    repo: "Comfy-Org/Qwen-Image_ComfyUI",
    repoPath: "split_files/text_encoders/qwen_2.5_vl_7b.safetensors",
    sizeGb: 16.58,
  }),
  qwenEditVae: f({
    filename: "qwen_image_vae.safetensors",
    folder: "vae",
    apiFolders: ["vae"],
    repo: "Comfy-Org/Qwen-Image_ComfyUI",
    repoPath: "split_files/vae/qwen_image_vae.safetensors",
    sizeGb: 0.25,
  }),
  zImageUnet: f({
    filename: "z_image_turbo_bf16.safetensors",
    folder: "diffusion_models",
    apiFolders: ["diffusion_models"],
    repo: "Comfy-Org/z_image_turbo",
    repoPath: "split_files/diffusion_models/z_image_turbo_bf16.safetensors",
    sizeGb: 12.31,
  }),
  zImageTextEncoder: f({
    filename: "qwen_3_4b.safetensors",
    folder: "text_encoders",
    apiFolders: ["text_encoders"],
    repo: "Comfy-Org/z_image_turbo",
    repoPath: "split_files/text_encoders/qwen_3_4b.safetensors",
    sizeGb: 8.04,
  }),
  zImageVae: f({
    // The repo ships it as `ae.safetensors`; it is saved under a distinct name so it
    // cannot collide with the Flux/HiDream `ae.safetensors`.
    filename: "z_image_ae.safetensors",
    folder: "vae",
    apiFolders: ["vae"],
    repo: "Comfy-Org/z_image_turbo",
    repoPath: "split_files/vae/ae.safetensors",
    sizeGb: 0.34,
  }),
  wan5bUnet: f({
    filename: "wan2.2_ti2v_5B_fp16.safetensors",
    folder: "diffusion_models",
    apiFolders: ["diffusion_models"],
    repo: "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
    repoPath: "split_files/diffusion_models/wan2.2_ti2v_5B_fp16.safetensors",
    sizeGb: 10.0,
  }),
  wan22Vae: f({
    filename: "wan2.2_vae.safetensors",
    folder: "vae",
    apiFolders: ["vae"],
    repo: "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
    repoPath: "split_files/vae/wan2.2_vae.safetensors",
    sizeGb: 1.41,
  }),
  wan14bHigh: f({
    filename: "Wan2.2-I2V-A14B-HighNoise-Q8_0.gguf",
    folder: "unet",
    apiFolders: ["unet_gguf"],
    repo: "QuantStack/Wan2.2-I2V-A14B-GGUF",
    repoPath: "HighNoise/Wan2.2-I2V-A14B-HighNoise-Q8_0.gguf",
    sizeGb: 15.41,
  }),
  wan14bLow: f({
    filename: "Wan2.2-I2V-A14B-LowNoise-Q8_0.gguf",
    folder: "unet",
    apiFolders: ["unet_gguf"],
    repo: "QuantStack/Wan2.2-I2V-A14B-GGUF",
    repoPath: "LowNoise/Wan2.2-I2V-A14B-LowNoise-Q8_0.gguf",
    sizeGb: 15.41,
  }),
  wan14bSekoHigh: f({
    filename: "Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1-high_noise.safetensors",
    folder: "loras",
    apiFolders: ["loras"],
    repo: "lightx2v/Wan2.2-Lightning",
    repoPath: "Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/high_noise_model.safetensors",
    sizeGb: 1.23,
  }),
  wan14bSekoLow: f({
    filename: "Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1-low_noise.safetensors",
    folder: "loras",
    apiFolders: ["loras"],
    repo: "lightx2v/Wan2.2-Lightning",
    repoPath: "Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1/low_noise_model.safetensors",
    sizeGb: 1.23,
  }),
  // Every Wan 14B model uses the Wan 2.1 VAE; only the 5B uses the 2.2 VAE.
  wan21Vae: f({
    filename: "wan_2.1_vae.safetensors",
    folder: "vae",
    apiFolders: ["vae"],
    repo: "Comfy-Org/Wan_2.2_ComfyUI_Repackaged",
    repoPath: "split_files/vae/wan_2.1_vae.safetensors",
    sizeGb: 0.25,
  }),
  umt5Gguf: f({
    filename: "umt5-xxl-encoder-Q8_0.gguf",
    folder: "text_encoders",
    apiFolders: ["clip_gguf", "text_encoders"],
    repo: "city96/umt5-xxl-encoder-gguf",
    repoPath: "umt5-xxl-encoder-Q8_0.gguf",
    sizeGb: 6.04,
  }),
  clipVisionH: f({
    filename: "clip_vision_h.safetensors",
    folder: "clip_vision",
    apiFolders: ["clip_vision"],
    repo: "Comfy-Org/Wan_2.1_ComfyUI_repackaged",
    repoPath: "split_files/clip_vision/clip_vision_h.safetensors",
    sizeGb: 1.26,
  }),
  ltxUnet: f({
    filename: "ltx-2.5-22b-distilled-transformer-bf16.safetensors",
    folder: "diffusion_models",
    apiFolders: ["diffusion_models"],
    repo: "Lightricks/LTX-2.5",
    repoPath: "diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors",
    sizeGb: 42.02,
    gated: true,
  }),
  ltxTextEncoder: f({
    filename: "gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
    folder: "text_encoders",
    apiFolders: ["text_encoders"],
    repo: "Lightricks/LTX-2.5",
    repoPath: "text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors",
    sizeGb: 26.26,
    gated: true,
  }),
  ltxVideoVae: f({
    filename: "ltx-2.5-video-vae-bf16.safetensors",
    folder: "vae",
    apiFolders: ["vae"],
    repo: "Lightricks/LTX-2.5",
    repoPath: "vae/ltx-2.5-video-vae-bf16.safetensors",
    sizeGb: 1.47,
    gated: true,
  }),
  ltxAudioVae: f({
    filename: "ltx-2.5-audio-vae-bf16.safetensors",
    folder: "vae",
    apiFolders: ["vae"],
    repo: "Lightricks/LTX-2.5",
    repoPath: "vae/ltx-2.5-audio-vae-bf16.safetensors",
    sizeGb: 0.36,
    gated: true,
  }),
  ltxSpatialUpscaler: f({
    filename: "ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
    folder: "latent_upscale_models",
    apiFolders: ["latent_upscale_models"],
    repo: "Lightricks/LTX-2.5",
    repoPath: "latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors",
    sizeGb: 1.0,
    gated: true,
  }),
  seedvr2Vae: f({
    filename: "ema_vae_fp16.safetensors",
    folder: "SEEDVR2",
    apiFolders: ["seedvr2"],
    repo: "numz/SeedVR2_comfyUI",
    repoPath: "ema_vae_fp16.safetensors",
    sizeGb: 0.5,
  }),
  seedvr2Dit3b: f({
    filename: "seedvr2_ema_3b_fp16.safetensors",
    folder: "SEEDVR2",
    apiFolders: ["seedvr2"],
    repo: "numz/SeedVR2_comfyUI",
    repoPath: "seedvr2_ema_3b_fp16.safetensors",
    sizeGb: 6.78,
  }),
  seedvr2Dit7bQ8: f({
    filename: "seedvr2_ema_7b-Q8_0.gguf",
    folder: "SEEDVR2",
    apiFolders: ["seedvr2"],
    repo: "cmeka/SeedVR2-GGUF",
    repoPath: "seedvr2_ema_7b-Q8_0.gguf",
    sizeGb: 8.84,
  }),
} satisfies Record<string, ModelFile>;

export type ModelFileKey = keyof typeof MODEL_FILES;

export type NodePackId = "core" | "comfyui-gguf" | "comfyui-seedvr2_videoupscaler" | "comfyui-frame-interpolation";

export type NodePack = {
  id: NodePackId;
  label: string;
  /** Argument for `comfy node install`; undefined for ComfyUI core. */
  installName?: string;
  fix: string;
};

export const NODE_PACKS: Record<NodePackId, NodePack> = {
  core: {
    id: "core",
    label: "ComfyUI core",
    fix: "`comfy update comfy`, then restart ComfyUI",
  },
  "comfyui-gguf": {
    id: "comfyui-gguf",
    label: "ComfyUI-GGUF (city96)",
    installName: "comfyui-gguf",
    fix: "`comfy node install comfyui-gguf`, then restart ComfyUI",
  },
  "comfyui-seedvr2_videoupscaler": {
    id: "comfyui-seedvr2_videoupscaler",
    label: "ComfyUI-SeedVR2_VideoUpscaler (numz)",
    installName: "comfyui-seedvr2_videoupscaler",
    fix: "`comfy node install comfyui-seedvr2_videoupscaler`, then restart ComfyUI",
  },
  "comfyui-frame-interpolation": {
    id: "comfyui-frame-interpolation",
    label: "ComfyUI-Frame-Interpolation (Fannovel16)",
    installName: "comfyui-frame-interpolation",
    fix: "`comfy node install comfyui-frame-interpolation`, then restart ComfyUI",
  },
};

export type EngineId =
  | "z-image-turbo"
  | "qwen-image-2.1"
  | "qwen-image-edit-2511"
  | "wan2.2-ti2v-5b"
  | "wan2.2-i2v-a14b"
  | "ltx-2.5"
  | "seedvr2-3b"
  | "seedvr2-7b-q8"
  | "rife-4.7";

export type EngineMode = "text_to_image" | "image_edit" | "image_to_video" | "text_to_video" | "first_last_frame" | "upscale_image" | "upscale_video" | "interpolate";

export type EngineDefinition = {
  id: EngineId;
  tool: ComfyToolKind;
  label: string;
  /** Model identifier announced before a run (spec 15). */
  model: string;
  modes: EngineMode[];
  licence: LicenceId;
  nodes: Array<{ classType: string; pack: NodePackId }>;
  /** Files without which the engine cannot run at all. */
  requiredFiles: ModelFileKey[];
  /** Files that unlock a faster/better variant; reported but never block availability. */
  optionalFiles: ModelFileKey[];
  /** Rough peak memory (GB of unified memory or VRAM) for a default-sized job. */
  memoryGb: number;
  notes: string[];
  /** Weights that a node pack fetches on its own at first use (not visible through /models). */
  autoDownloads?: string[];
};

const CORE = "core" as const;

export const ENGINES: Record<EngineId, EngineDefinition> = {
  "z-image-turbo": {
    id: "z-image-turbo",
    tool: "image",
    label: "Z-Image-Turbo (bf16, 8 steps)",
    model: "z-image-turbo-bf16",
    modes: ["text_to_image"],
    licence: "apache-2.0",
    nodes: [
      { classType: "UNETLoader", pack: CORE },
      { classType: "CLIPLoader", pack: CORE },
      { classType: "VAELoader", pack: CORE },
      { classType: "ModelSamplingAuraFlow", pack: CORE },
      { classType: "EmptySD3LatentImage", pack: CORE },
      { classType: "ConditioningZeroOut", pack: CORE },
      { classType: "KSampler", pack: CORE },
      { classType: "SaveImage", pack: CORE },
    ],
    requiredFiles: ["zImageUnet", "zImageTextEncoder", "zImageVae"],
    optionalFiles: [],
    memoryGb: 24,
    notes: ["Fastest local still; text-to-image only."],
  },
  "qwen-image-2.1": {
    id: "qwen-image-2.1",
    tool: "image",
    label: "Qwen-Image-2.1 (bf16; turbo LoRA = 8-step fast mode; edit with reference images)",
    model: "qwen-image-2.1-bf16",
    modes: ["text_to_image", "image_edit"],
    licence: "qwen-research",
    nodes: [
      { classType: "UNETLoader", pack: CORE },
      { classType: "CLIPLoader", pack: CORE },
      { classType: "VAELoader", pack: CORE },
      { classType: "LoraLoaderModelOnly", pack: CORE },
      { classType: "TextEncodeQwenImage21", pack: CORE },
      { classType: "EmptySD3LatentImage", pack: CORE },
      { classType: "KSampler", pack: CORE },
      { classType: "SaveImage", pack: CORE },
    ],
    requiredFiles: ["qwen21Unet", "qwen21TextEncoder", "qwen21Vae"],
    optionalFiles: ["qwen21TurboLora"],
    memoryGb: 40,
    notes: [
      "Needs a ComfyUI build with Qwen-Image 2.1 support (TextEncodeQwenImage21, added 2026-09-20).",
      "Research / non-commercial licence — not the default for text-to-image for that reason.",
    ],
  },
  "qwen-image-edit-2511": {
    id: "qwen-image-edit-2511",
    tool: "image",
    label: "Qwen-Image-Edit-2511 (bf16 + Lightning 4/8-step LoRA)",
    model: "qwen-image-edit-2511-bf16",
    modes: ["image_edit"],
    licence: "apache-2.0",
    nodes: [
      { classType: "UNETLoader", pack: CORE },
      { classType: "CLIPLoader", pack: CORE },
      { classType: "VAELoader", pack: CORE },
      { classType: "LoraLoaderModelOnly", pack: CORE },
      { classType: "ModelSamplingAuraFlow", pack: CORE },
      { classType: "CFGNorm", pack: CORE },
      { classType: "LoadImage", pack: CORE },
      { classType: "FluxKontextImageScale", pack: CORE },
      { classType: "TextEncodeQwenImageEditPlus", pack: CORE },
      { classType: "FluxKontextMultiReferenceLatentMethod", pack: CORE },
      { classType: "VAEEncode", pack: CORE },
      { classType: "KSampler", pack: CORE },
      { classType: "SaveImage", pack: CORE },
    ],
    requiredFiles: ["qwenEditUnet", "qwenEditTextEncoder", "qwenEditVae"],
    optionalFiles: ["qwenEditLightning4", "qwenEditLightning8"],
    memoryGb: 64,
    notes: ["Edit only: 1–3 reference images. Lightning 4-step is the default fast mode."],
  },
  "wan2.2-ti2v-5b": {
    id: "wan2.2-ti2v-5b",
    tool: "video",
    label: "Wan 2.2 TI2V-5B (fp16, 24 fps)",
    model: "wan2.2-ti2v-5b-fp16",
    modes: ["text_to_video", "image_to_video"],
    licence: "apache-2.0",
    nodes: [
      { classType: "UNETLoader", pack: CORE },
      { classType: "CLIPLoaderGGUF", pack: "comfyui-gguf" },
      { classType: "VAELoader", pack: CORE },
      { classType: "ModelSamplingSD3", pack: CORE },
      { classType: "Wan22ImageToVideoLatent", pack: CORE },
      { classType: "KSampler", pack: CORE },
      { classType: "CreateVideo", pack: CORE },
      { classType: "SaveVideo", pack: CORE },
    ],
    requiredFiles: ["wan5bUnet", "wan22Vae", "umt5Gguf"],
    optionalFiles: [],
    memoryGb: 24,
    notes: ["Lightest local video engine; the only Wan engine that does text-to-video here."],
  },
  "wan2.2-i2v-a14b": {
    id: "wan2.2-i2v-a14b",
    tool: "video",
    label: "Wan 2.2 I2V-A14B (Q8 GGUF high+low noise, Seko 4-step LoRAs, 16 fps)",
    model: "wan2.2-i2v-a14b-q8-gguf-seko-4step",
    modes: ["image_to_video", "first_last_frame"],
    licence: "apache-2.0",
    nodes: [
      { classType: "UnetLoaderGGUF", pack: "comfyui-gguf" },
      { classType: "CLIPLoaderGGUF", pack: "comfyui-gguf" },
      { classType: "LoraLoaderModelOnly", pack: CORE },
      { classType: "ModelSamplingSD3", pack: CORE },
      { classType: "VAELoader", pack: CORE },
      { classType: "WanImageToVideo", pack: CORE },
      { classType: "WanFirstLastFrameToVideo", pack: CORE },
      { classType: "KSamplerAdvanced", pack: CORE },
      { classType: "CreateVideo", pack: CORE },
      { classType: "SaveVideo", pack: CORE },
    ],
    requiredFiles: ["wan14bHigh", "wan14bLow", "wan14bSekoHigh", "wan14bSekoLow", "wan21Vae", "umt5Gguf"],
    optionalFiles: ["clipVisionH"],
    memoryGb: 40,
    notes: [
      "Image-to-video and first/last-frame only; needs a start image.",
      "clip_vision_h is listed for Wan 2.1-style conditioning; the Wan 2.2 graph does not use it.",
    ],
  },
  "ltx-2.5": {
    id: "ltx-2.5",
    tool: "video",
    label: "LTX-2.5 22B distilled (bf16, native audio, optional x2 latent upscaler)",
    model: "ltx-2.5-22b-distilled-bf16",
    modes: ["text_to_video", "image_to_video", "first_last_frame"],
    licence: "ltx-2-community",
    nodes: [
      { classType: "UNETLoader", pack: CORE },
      { classType: "CLIPLoader", pack: CORE },
      { classType: "VAELoader", pack: CORE },
      { classType: "LTXVConditioning", pack: CORE },
      { classType: "EmptyLTXVLatentVideo", pack: CORE },
      { classType: "LTXVEmptyLatentAudio", pack: CORE },
      { classType: "LTXVConcatAVLatent", pack: CORE },
      { classType: "LTXVSeparateAVLatent", pack: CORE },
      { classType: "LTXVImgToVideoInplace", pack: CORE },
      { classType: "LTXVPreprocess", pack: CORE },
      { classType: "LTXVAddGuide", pack: CORE },
      { classType: "LTXVCropGuides", pack: CORE },
      { classType: "LTXVDualCFGGuider", pack: CORE },
      { classType: "LTXVAudioVAEDecode", pack: CORE },
      { classType: "RandomNoise", pack: CORE },
      { classType: "KSamplerSelect", pack: CORE },
      { classType: "ManualSigmas", pack: CORE },
      { classType: "SamplerCustomAdvanced", pack: CORE },
      { classType: "VAEDecodeTiled", pack: CORE },
      { classType: "CreateVideo", pack: CORE },
      { classType: "SaveVideo", pack: CORE },
    ],
    requiredFiles: ["ltxUnet", "ltxTextEncoder", "ltxVideoVae", "ltxAudioVae"],
    optionalFiles: ["ltxSpatialUpscaler"],
    memoryGb: 80,
    notes: [
      "Gated on Hugging Face: accept the licence at https://huggingface.co/Lightricks/LTX-2.5, then `hf auth login`.",
      "Generates a soundtrack with the clip (native audio).",
      "Graph mirrors the official LTX-2.5 templates but is unverified on MPS.",
    ],
  },
  "seedvr2-3b": {
    id: "seedvr2-3b",
    tool: "upscale",
    label: "SeedVR2 3B (fp16) image/video restore-upscale",
    model: "seedvr2-ema-3b-fp16",
    modes: ["upscale_image", "upscale_video"],
    licence: "apache-2.0",
    nodes: [
      { classType: "SeedVR2LoadDiTModel", pack: "comfyui-seedvr2_videoupscaler" },
      { classType: "SeedVR2LoadVAEModel", pack: "comfyui-seedvr2_videoupscaler" },
      { classType: "SeedVR2VideoUpscaler", pack: "comfyui-seedvr2_videoupscaler" },
      { classType: "LoadImage", pack: CORE },
      { classType: "SaveImage", pack: CORE },
    ],
    requiredFiles: ["seedvr2Dit3b", "seedvr2Vae"],
    optionalFiles: [],
    memoryGb: 16,
    notes: ["Over-sharpens 720p AI clips at high scale; defaults stay modest (1.5x video, 2x stills)."],
  },
  "seedvr2-7b-q8": {
    id: "seedvr2-7b-q8",
    tool: "upscale",
    label: "SeedVR2 7B (Q8 GGUF) quality restore-upscale",
    model: "seedvr2-ema-7b-q8-gguf",
    modes: ["upscale_image", "upscale_video"],
    licence: "apache-2.0",
    nodes: [
      { classType: "SeedVR2LoadDiTModel", pack: "comfyui-seedvr2_videoupscaler" },
      { classType: "SeedVR2LoadVAEModel", pack: "comfyui-seedvr2_videoupscaler" },
      { classType: "SeedVR2VideoUpscaler", pack: "comfyui-seedvr2_videoupscaler" },
      { classType: "LoadImage", pack: CORE },
      { classType: "SaveImage", pack: CORE },
    ],
    requiredFiles: ["seedvr2Dit7bQ8", "seedvr2Vae"],
    optionalFiles: [],
    memoryGb: 24,
    notes: ["The `quality` option. The numz node pack loads GGUF itself (its requirements include `gguf`)."],
  },
  "rife-4.7": {
    id: "rife-4.7",
    tool: "upscale",
    label: "RIFE 4.7 frame interpolation",
    model: "rife47",
    modes: ["interpolate"],
    licence: "apache-2.0",
    nodes: [{ classType: "RIFE VFI", pack: "comfyui-frame-interpolation" }],
    requiredFiles: [],
    optionalFiles: [],
    memoryGb: 4,
    notes: ["rife47.pth is downloaded by the node pack on first use."],
    autoDownloads: ["rife47.pth (comfyui-frame-interpolation/ckpts/rife)"],
  },
};

/**
 * Default engine order per tool and mode when the caller names no engine. Ordered by
 * licence first (Apache-2.0 before research / revenue-capped licences), then speed.
 */
export const DEFAULT_ENGINE_ORDER: Record<EngineMode, EngineId[]> = {
  text_to_image: ["z-image-turbo", "qwen-image-2.1"],
  image_edit: ["qwen-image-edit-2511", "qwen-image-2.1"],
  image_to_video: ["wan2.2-i2v-a14b", "wan2.2-ti2v-5b", "ltx-2.5"],
  text_to_video: ["wan2.2-ti2v-5b", "ltx-2.5"],
  first_last_frame: ["wan2.2-i2v-a14b", "ltx-2.5"],
  upscale_image: ["seedvr2-3b", "seedvr2-7b-q8"],
  upscale_video: ["seedvr2-3b", "seedvr2-7b-q8"],
  interpolate: ["rife-4.7"],
};

export function enginesForTool(tool: ComfyToolKind): EngineDefinition[] {
  return Object.values(ENGINES).filter((engine) => engine.tool === tool);
}

export function engineFiles(engine: EngineDefinition, options: { includeOptional?: boolean } = {}): ModelFile[] {
  const keys = options.includeOptional === false ? engine.requiredFiles : [...engine.requiredFiles, ...engine.optionalFiles];
  return keys.map((key) => MODEL_FILES[key]);
}

const FP8_PATTERN = /fp8|float8|e4m3|e5m2/iu;
const UNVERIFIED_MPS_PATTERN = /int8[_-]convrot|int4|nvfp4|w4a8/iu;

/**
 * Mac rule: never hand fp8 weights to MPS (there are no Float8 kernels), and do not
 * default to the int8_convrot/int4 Comfy builds there — they are unverified on MPS.
 * `onMps` is decided by the ComfyUI server's own device, not this process's OS, so a
 * COMFY_URL pointing at a CUDA box is not blocked.
 */
export function assertMpsSafeWeights(filenames: string[], onMps: boolean): void {
  if (!onMps) {
    return;
  }

  const fp8 = filenames.filter((name) => FP8_PATTERN.test(name));
  if (fp8.length > 0) {
    throw new Error(
      `refusing fp8 weights on Apple Silicon (no Float8 kernels on MPS): ${fp8.join(", ")}. Use the bf16/fp16 or GGUF file instead.`,
    );
  }

  const unverified = filenames.filter((name) => UNVERIFIED_MPS_PATTERN.test(name));
  if (unverified.length > 0) {
    throw new Error(
      `refusing ${unverified.join(", ")} on MPS: int8_convrot/int4 Comfy builds are unverified on Apple Silicon. Use the bf16/fp16 or GGUF file instead.`,
    );
  }
}

/** Node class -> pack, for turning a missing class into the right install command. */
export function nodePackFor(classType: string): NodePackId | undefined {
  for (const engine of Object.values(ENGINES)) {
    const match = engine.nodes.find((node) => node.classType === classType);
    if (match !== undefined) {
      return match.pack;
    }
  }

  return CORE_IO_NODES.has(classType) ? "core" : undefined;
}

const CORE_IO_NODES = new Set([
  "LoadImage",
  "ImageScale",
  "ImageScaleBy",
  "CLIPTextEncode",
  "VAEDecode",
  "VAEEncode",
  "LoadVideo",
  "GetVideoComponents",
  "ComfyMathExpression",
  "CreateVideo",
  "SaveVideo",
  "SaveImage",
  "LatentUpscaleModelLoader",
  "LTXVLatentUpsampler",
]);
