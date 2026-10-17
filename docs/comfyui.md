# Local by default: ComfyUI

Show Sidekick's default route for stills, image edits, video clips, and upscaling is a ComfyUI server you run yourself. It costs nothing per call, keeps media on your machine, and the registry falls back to the paid providers only when no local engine is ready.

## Quick start

```bash
showkick doctor --profile local-comfy   # what is ready, what is missing, and the fix for each
showkick setup comfy                    # guided install: asks before every step
```

`showkick setup comfy` detects your hardware, recommends an engine tier, and then — each only after a yes at its own prompt — runs:

1. `uv tool install comfy-cli` (it will not install uv itself; install uv first if it is missing)
2. `comfy --skip-prompt install --m-series` (Apple Silicon), `--nvidia` (CUDA), or `--cpu`
3. `comfy launch --background`
4. `comfy node install comfyui-gguf comfyui-seedvr2_videoupscaler comfyui-frame-interpolation` (only the missing packs), then an optional restart
5. Model downloads, listed first with size, source repo, and licence

Run it with `--engines z-image-turbo,wan2.2-ti2v-5b` to choose engines, `--skip-models` to skip downloads, or `--workspace <path>` when `comfy which` cannot find ComfyUI. In a non-interactive shell, with `--json`, or with `--dry-run`, it prints the plan and runs nothing. It never runs `comfy update`; when an engine needs a newer ComfyUI core (Qwen-Image-2.1 needs `TextEncodeQwenImage21`), it tells you to update yourself.

The server URL comes from `COMFY_URL` (or `SHOW_SIDEKICK_COMFY_URL`), default `http://127.0.0.1:8188`.

## Tools and engines

| Tool | Capability | Engines |
|---|---|---|
| `comfy_image` | `image_generation` (+ edits via `reference_images`) | `z-image-turbo`, `qwen-image-edit-2511`, `qwen-image-2.1` |
| `comfy_video` | `image_to_video` (+ `first_last_frame`) | `wan2.2-i2v-a14b`, `wan2.2-ti2v-5b`, `ltx-2.5` |
| `comfy_text_to_video` | `text_to_video` | `wan2.2-ti2v-5b`, `ltx-2.5` |
| `comfy_upscale` | `upscale` | `seedvr2-3b`, `seedvr2-7b-q8` (`quality: true`), `rife-4.7` (`interpolate`) |

Availability degrades per engine: a tool is available when at least one of its engines is ready, and each missing engine reports the exact node class or model file and the command that fixes it. With no `engine` given, a tool takes the first ready engine in a licence-first order (Apache-2.0 before research/revenue-capped licences). A named `engine` is never swapped for another.

Graphs are built in code (ComfyUI API format) from the official ComfyUI templates and checked against the server's `/object_info` before queueing.

## Model files

Folders are relative to ComfyUI's `models/` directory. Sizes from Hugging Face, 2026-10-17.

| Engine | File | Size | Source |
|---|---|---|---|
| Z-Image-Turbo | `diffusion_models/z_image_turbo_bf16.safetensors` | 12.3 GB | Comfy-Org/z_image_turbo |
| | `text_encoders/qwen_3_4b.safetensors` | 8.0 GB | Comfy-Org/z_image_turbo |
| | `vae/z_image_ae.safetensors` (repo: `ae.safetensors`) | 0.3 GB | Comfy-Org/z_image_turbo |
| Qwen-Image-Edit-2511 | `diffusion_models/qwen_image_edit_2511_bf16.safetensors` | 40.9 GB | Comfy-Org/Qwen-Image-Edit_ComfyUI |
| | `loras/Qwen-Image-Edit-2511-Lightning-{4,8}steps-V1.0-bf16.safetensors` | 0.85 GB each | lightx2v/Qwen-Image-Edit-2511-Lightning |
| | `text_encoders/qwen_2.5_vl_7b.safetensors` | 16.6 GB | Comfy-Org/Qwen-Image_ComfyUI |
| | `vae/qwen_image_vae.safetensors` | 0.25 GB | Comfy-Org/Qwen-Image_ComfyUI |
| Qwen-Image-2.1 | `diffusion_models/qwen_image_2.1_bf16.safetensors` | 14.2 GB | Comfy-Org/Qwen-Image-2.1 |
| | `loras/qwen_image_2.1_turbo_lora_avg_rank_178_bf16.safetensors` | 0.9 GB | Comfy-Org/Qwen-Image-2.1 |
| | `text_encoders/qwen3vl_8b_bf16.safetensors` | 17.5 GB | Comfy-Org/Qwen-Image-2.1 |
| | `vae/qwen_image_2.1_vae_bf16.safetensors` | 0.7 GB | Comfy-Org/Qwen-Image-2.1 |
| Wan 2.2 TI2V-5B | `diffusion_models/wan2.2_ti2v_5B_fp16.safetensors` | 10.0 GB | Comfy-Org/Wan_2.2_ComfyUI_Repackaged |
| | `vae/wan2.2_vae.safetensors` | 1.4 GB | Comfy-Org/Wan_2.2_ComfyUI_Repackaged |
| Wan 2.2 I2V-A14B | `unet/Wan2.2-I2V-A14B-{HighNoise,LowNoise}-Q8_0.gguf` | 15.4 GB each | QuantStack/Wan2.2-I2V-A14B-GGUF |
| | `loras/Wan2.2-I2V-A14B-4steps-lora-rank64-Seko-V1-{high,low}_noise.safetensors` | 1.2 GB each | lightx2v/Wan2.2-Lightning |
| | `vae/wan_2.1_vae.safetensors` (every Wan 14B uses the 2.1 VAE) | 0.25 GB | Comfy-Org/Wan_2.2_ComfyUI_Repackaged |
| Both Wan | `text_encoders/umt5-xxl-encoder-Q8_0.gguf` | 6.0 GB | city96/umt5-xxl-encoder-gguf |
| LTX-2.5 (gated) | `diffusion_models/ltx-2.5-22b-distilled-transformer-bf16.safetensors` | 42.0 GB | Lightricks/LTX-2.5 |
| | `text_encoders/gemma4-12b-with-proj-ltx-2.5-bf16.safetensors` | 26.3 GB | Lightricks/LTX-2.5 |
| | `vae/ltx-2.5-video-vae-bf16.safetensors`, `vae/ltx-2.5-audio-vae-bf16.safetensors` | 1.5 + 0.4 GB | Lightricks/LTX-2.5 |
| | `latent_upscale_models/ltx-2.5-latent-spatial-upscaler-x2-bf16-1.0.safetensors` (optional) | 1.0 GB | Lightricks/LTX-2.5 |
| SeedVR2 | `SEEDVR2/seedvr2_ema_3b_fp16.safetensors`, `SEEDVR2/ema_vae_fp16.safetensors` | 6.8 + 0.5 GB | numz/SeedVR2_comfyUI |
| | `SEEDVR2/seedvr2_ema_7b-Q8_0.gguf` | 8.8 GB | cmeka/SeedVR2-GGUF |
| RIFE 4.7 | `rife47.pth` | small | fetched by comfyui-frame-interpolation on first use |

`clip_vision/clip_vision_h.safetensors` is listed for Wan 2.1-style conditioning; the Wan 2.2 graphs do not use it and setup does not download it.

## Apple Silicon rules

- **Never fp8 on MPS.** There are no Float8 kernels on Apple Silicon. Every default here is bf16/fp16 or GGUF, and the tools refuse fp8 files when the ComfyUI server reports an MPS device.
- **GGUF needs comfyui-gguf** (`UnetLoaderGGUF`, `CLIPLoaderGGUF`). The SeedVR2 pack loads its own GGUF.
- **`int8_convrot` builds are unverified on MPS** (the official LTX-2.5 and SeedVR2 templates use them); the tools refuse them on an MPS server rather than default to them.
- The guard follows the *server's* device, so `COMFY_URL` pointing at a CUDA machine is not blocked.

## Licences

| Engine | Licence |
|---|---|
| Z-Image-Turbo, Qwen-Image-Edit-2511, Wan 2.2, SeedVR2, RIFE | Apache-2.0 |
| Qwen-Image-2.1 | Qwen research licence — research / non-commercial |
| LTX-2.5 | LTX-2.x community licence — free under $10M annual revenue; gated on Hugging Face |

The default engine order and the setup's default download set use Apache-2.0 engines; Qwen-Image-2.1 and LTX-2.5 are opt-in (`--engines`).

### LTX-2.5 is gated

1. Accept the licence at https://huggingface.co/Lightricks/LTX-2.5 while signed in.
2. Run `hf auth login` yourself. Show Sidekick never asks for, stores, or passes the token.
3. Rerun `showkick setup comfy --engines ltx-2.5`.

## Defaults worth knowing

- SeedVR2 over-sharpens 720p AI clips when pushed, so `comfy_upscale` defaults to 2x for stills and 1.5x for video. Try `pre_downscale: 0.5` before raising `scale`.
- Video defaults are 5 s at the engine's native size: Wan 14B 832x480 at 16 fps, Wan 5B and LTX 1280x704 at 24 fps (`9:16` swaps them).
- LTX-2.5 runs its half-resolution pass plus the x2 latent upscaler when the upscaler file is present, and always returns audio.

## What is verified

Run on ComfyUI 0.33.0, macOS (MPS, 128 GB) on 2026-10-17: Z-Image-Turbo text-to-image through `comfy_image`, and a SeedVR2 3B 2x image upscale through `comfy_upscale`. Every other graph is validated against that server's `/object_info` (node classes, input names, link types, enum values) but has not been run end to end; Qwen-Image-2.1 needs a ComfyUI build newer than 0.33.0.
