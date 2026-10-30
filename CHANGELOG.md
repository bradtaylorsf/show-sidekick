# Changelog

## 0.5.0

### Minor Changes

- 1020580: Fix the cuesheet audio step: whisper-cli no longer gets a bogus `--print-progress false` argument, `WHISPER_MODEL` (with `~`/`$HOME`) reaches whisper-cli as a model file path, bare model names resolve to `ggml-<name>.bin` in the whisper cache, and `whisper-cpp` / `WHISPER_CLI` are probed besides `whisper-cli`. Local whisper.cpp stays the default transcriber even when `ELEVENLABS_API_KEY` is set; a new `TRANSCRIPTION_PROVIDER` setting pins whisper-cpp or ElevenLabs Scribe, and Scribe only ever receives `scribe_*` model ids. `showkick doctor` now checks the whisper binary and model. Relative `inputs.*` paths resolve from the episode YAML's folder first (then the project root), an audio `inputs.narration` works as the cuesheet input, `showkick build` creates the episode from a matching `ingest.watch` drop when its YAML is missing, and `showkick watch --import` writes episodes for new drops.
- 3b8ab66: Full builds can now run unattended. `showkick build --agent "<command>"` (or `SHOW_SIDEKICK_AGENT`) spawns a headless agent for each stage, and `--review-gate final` defers required approvals to a single review after the last stage. Each deferred approval is logged, and any critical reviewer finding still halts the run. A full build with no agent attached now fails fast with guidance instead of `stream ended before a matching stage event was emitted` (#298).

## 0.4.0

### Minor Changes

- bf88f00: Local ComfyUI is now the default route for stills, image edits, video clips, and upscaling. New `comfy_image` (Z-Image-Turbo, Qwen-Image-Edit-2511, Qwen-Image-2.1), `comfy_video` / `comfy_text_to_video` (Wan 2.2 I2V-A14B GGUF, Wan 2.2 TI2V-5B, LTX-2.5 with native audio), and `comfy_upscale` (SeedVR2 3B/7B, RIFE 4.7) tools cost $0, announce before running, and report per-engine readiness with the exact missing node or model file. `registry.select()` prefers zero-cost `local-default` tools once available and falls back to paid providers otherwise. `showkick doctor` now reports the `local-comfy` route first (`--profile local-comfy` for just that), and `showkick setup comfy` is a guided install that detects Apple Silicon vs CUDA, recommends an engine tier, and asks before every install, launch, node pack, and model download (with sizes, source repos, and licences). Apple Silicon defaults are bf16/fp16/GGUF only; fp8 and int8_convrot weights are refused on MPS.

### Patch Changes

- b70b77b: Add all-local production guidance: `docs/local-production.md` plus four agent skills — `blender-animation` (spec-first, idempotent headless bpy, render→critique→fix loop, chunked resumable renders), `blender-5-api` (5.x API pitfalls), `voicebox` (local Qwen3-TTS/Kokoro narration and voice cloning via the Voicebox app), and `local-sound` (commercially safe local SFX and music: Stable Audio Open, ACE-Step 1.5, Freesound CC0, and the licence traps to avoid).

## 0.3.0

### Minor Changes

- d66c89a: Add Brave Search API tools for web research and image asset download (#300)
  - New `brave_search` tool (`web_search` capability): API-backed web search for episode research with titled, linked, snippeted results, freshness/country/safesearch controls, and $0.005/call cost metadata. Auth via `BRAVE_SEARCH_API_KEY`.
  - New `brave_image_search` tool (`stock_image` capability): searches the whole web for topical imagery alongside the stock providers and participates in `stock_cross_search`. Results carry dimensions and an attribution block (source page URL, source domain, and an "Unknown license — verify before publication" flag); `download_top` fetches the top result and returns its `image_path`.
  - New `headline-slideshow` test-only bundled pipeline with four director skills — research (brave_search) → assets (brave_image_search) → edit → compose — proving both tools end to end with a silent, ffprobe-validated 1080p slideshow.
  - Asset manifest entries now accept optional `width`, `height`, and `attribution` metadata so search-sourced imagery keeps its provenance and license flag through the editor handoff.
  - Fixed the external-agent build protocol so stdin stage events survive revision rounds and later stages instead of aborting the build after the first wait.
  - Fixed Remotion composition to render truly silent mp4s (no muxed silent AAC track) when the composition has no audio source, and raised the generic scene title cap to 160 characters so full-length headlines render untruncated.

## 0.2.0

### Minor Changes

- 463c84b: Add the bundled presentation-demo pipeline for turning local or downloadable presentation decks into narrated animated explainer rough cuts, including deck ingestion, review-gated script and voiceover timing, slide-aware Remotion/HyperFrames composition, starter content, and deck-specific export handoff packaging.

## 0.1.2

### Patch Changes

- 03d3140: Create GitHub Releases explicitly after trusted npm publishing succeeds.
- 7dda197: Skip the npm publish dry run when the current package version is already published, while keeping the tarball pack check active.

## 0.1.1

### Patch Changes

- d264a27: Generalize bundled starters and playbooks, add prompt-first onboarding docs, and update first-run CLI guidance for the no-key setup path.

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Locked the public naming contract for Show Sidekick: npm package `show-sidekick`, primary CLI `showkick`, CLI aliases `show-sidekick` and `showsidekick`, domain `showsidekick.com`, cache `.show-sidekick/`, and env prefix `SHOW_SIDEKICK_`.
- Recorded the npm availability publish gate for `show-sidekick`, `showkick`, `show-kick`, and `showsidekick`; the 2026-05-19 registry check returned `E404` for each name, so `show-sidekick` remains the intended public package and `showkick` the primary CLI.

## [0.1.0] - 2026-05-14

### Migration Note

- Public launch renames build-era `predit` to Show Sidekick, with npm package `show-sidekick` and CLI `showkick`.
- User-project cache/docs move from `.predit/` to `.show-sidekick/`. Legacy `PREDIT_*` env vars fail with guidance to rename them to matching `SHOW_SIDEKICK_*` names.

### Added

- Public README, [quickstart](docs/quickstart.md), contributor guide, generated [provider catalog](docs/providers.md), and user-project roadmap template.
- CLI lifecycle commands for `init`, `update`, `doctor`, and `setup`.
- Integrated build runner with checkpoints, approvals, resume state, first paid-call approval, and cost budget enforcement.
- Reviewer and audit flow for final review, force approvals, decision logging, and cost/status reporting.
- NLE exporters for Premiere XML, DaVinci XML, CapCut draft packages, and CMX 3600 EDL.
- `import` and `watch` flows for turning watched media drops into episode YAML.
- Generalized bundled starter shows with fixture-backed sample projects across music videos, news songs, cinematic trailers, animated explainers, screen demos, product demos, documentary montages, and source-led repurposing workflows.
- Registry-driven tool selection with generated provider documentation and CI freshness checks.
- Zero-key sample render path for bundled starters and framework smoke validation.
- Public release verification with `pnpm release:check` and `pnpm release:check:full`.

See the [README](README.md) for the current command surface.
