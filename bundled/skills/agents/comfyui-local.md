---
name: comfyui-local
description: Default local generation through the user's own ComfyUI — stills and edits (comfy_image), image/text-to-video and first/last-frame clips (comfy_video, comfy_text_to_video), and restore-upscaling plus frame interpolation (comfy_upscale). Use whenever the registry selects a comfy_* tool, when the user wants free/offline generation, or when doctor reports ComfyUI readiness.
applies_to: agents
agent_skill: true
critical: false
epic: 8
issue: 0
---

# ComfyUI Local Route

## Show Sidekick Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills` (`comfy_image`, `comfy_video`, `comfy_text_to_video`, `comfy_upscale`).
- Route execution through the Show Sidekick registry or CLI workflow. Never hand-write ComfyUI workflows or POST to the server around the tools.
- The comfy tools cost $0 and still announce before they run (tool, provider `comfyui`, model, engine, licence). No approval prompt is needed for a local run.
- Switching from a local engine to a paid provider, or from one engine to another model family, is a provider/model swap: ask first (spec 15). A tool given an `engine` never substitutes another one; it fails with the exact missing node or file.

## When To Use

- Any still, edit, clip, or upscale when `showkick doctor` (or `showkick doctor --profile local-comfy --json`) reports a ready engine. The registry already prefers these tools over paid providers when they are available.
- The user asks for free, offline, private, or "on my machine" generation.
- A paid provider is blocked (missing key, quota) and the local route is ready: propose it as the alternative, then wait for approval before switching.

## Model Identity

| Engine | Tool | Modes | Licence |
|---|---|---|---|
| `z-image-turbo` | `comfy_image` | text-to-image (8 steps, bf16) | Apache-2.0 |
| `qwen-image-edit-2511` | `comfy_image` | edit with 1–3 reference images; Lightning 4-step (`fast`), 8-step (`balanced`), base 40-step (`quality`) | Apache-2.0 |
| `qwen-image-2.1` | `comfy_image` | text-to-image and edit with up to 16 references; turbo LoRA = 8-step `fast` | Qwen research licence (non-commercial) |
| `wan2.2-i2v-a14b` | `comfy_video` | image-to-video, first/last frame; Q8 GGUF high+low noise experts with Seko 4-step LoRAs; 16 fps | Apache-2.0 |
| `wan2.2-ti2v-5b` | `comfy_video`, `comfy_text_to_video` | text-to-video, image-to-video; fp16; 24 fps | Apache-2.0 |
| `ltx-2.5` | `comfy_video`, `comfy_text_to_video` | text/image-to-video, first/last frame, **native audio**; optional x2 latent upscaler | LTX-2.x community licence (free under $10M revenue; gated) |
| `seedvr2-3b` / `seedvr2-7b-q8` | `comfy_upscale` | image and video restore-upscale (`quality: true` = 7B) | Apache-2.0 |
| `rife-4.7` | `comfy_upscale` | frame interpolation for video | Apache-2.0 |

With no `engine`, the tools pick the first ready engine in a licence-first order: Apache-2.0 engines before the research and revenue-capped ones.

## Prompt Structure

- Stills: subject, setting, light, lens/shot, style. Z-Image-Turbo needs no negative prompt.
- Edits: say what changes and what stays; refer to references as "image 1", "image 2". Image 1 sets the output framing.
- Video: one shot per clip — subject action, camera move, pacing. Wan uses its trained default negative prompt unless you pass `negative_prompt`. LTX-2.5 also writes the soundtrack; describe ambient sound in the prompt when it matters.

## Parameter Defaults

- `comfy_image`: ~1 MP at the requested `aspect_ratio` (or `size` / `width`+`height`); random seed unless `seed` is set; `speed` defaults to the fastest LoRA that is installed.
- `comfy_video`: engine-native size (Wan 14B 832x480, Wan 5B and LTX 1280x704; `9:16` swaps them); `duration` 5 s by default (max 10 s); frames snap to 4n+1 (Wan) or 8n+1 (LTX). LTX runs its half-res pass + x2 latent upscale when the upscaler file is installed (`upscale: false` turns it off).
- `comfy_upscale`: stills 2x, video 1.5x short edge — conservative on purpose, because SeedVR2 over-sharpens 720p AI clips when pushed. `pre_downscale` (e.g. 0.5) restores from a softer input; `resolution` sets an absolute short edge; `interpolate: true` adds RIFE 2x frames (fps doubles with it).
- `COMFY_URL` (or `SHOW_SIDEKICK_COMFY_URL`) points at a non-default server; the default is `http://127.0.0.1:8188`.

## Quality Keywords

- Stills: "cinematic photo", concrete light sources, lens and framing words.
- Video: explicit camera verbs ("slow push in", "orbit left"), "steady", "natural motion".

## Anti-Patterns

- Picking fp8 weights on Apple Silicon: MPS has no Float8 kernels. The manifest is bf16/fp16/GGUF only, and the tools refuse fp8 and the unverified `int8_convrot` builds on an MPS server.
- Silently swapping engines or falling back to a paid provider when a local engine is missing — report the doctor line and ask.
- Queueing heavy video jobs while the ComfyUI queue is busy; check `showkick doctor` and the queue first.
- Upscaling AI video 2x+ with SeedVR2 by default; start at 1.5x and try `pre_downscale` before raising the scale.
- Using `qwen-image-2.1` outputs commercially: its licence is research/non-commercial.
- Installing anything for the user. `showkick setup comfy` asks before every install, node pack, restart, and download; gated LTX-2.5 files need the user's own `hf auth login` after accepting the licence on Hugging Face.

## Workflow

1. Run `showkick doctor --profile local-comfy --json`. Each engine row says `ok` or `missing` with the exact node class or model file and the fix.
2. If nothing is ready, propose `showkick setup comfy` (or `--engines <list>`) and let the user run it; it prints file sizes, source repos, and licences before asking.
3. Call the tool through the registry. Pass `engine` only when the user or the brief chose one.
4. Inspect the output file, then record the engine/model in the decision log when it affects the cut.

## References

- `docs/comfyui.md` in the Show Sidekick repo — install, engines, model files, Mac rules.
- `ai-video-gen` — paid video gateways, used only after the user approves leaving the local route.
