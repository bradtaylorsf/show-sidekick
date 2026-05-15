---
name: "news-song-asset-director"
description: "Create PS2 lyric-art assets while preserving strict separation from real source screenshots."
applies_to: "pipelines/news-song"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - News Song Pipeline

## When To Use

Use this stage after scene planning and any real source capture. Build generated lyric-art plates, optional image-to-video motion, source flyout graphics, and asset records.

For generated shot prompts, use the shared five-aspect framework in `bundled/skills/_shared/video-prompting.md` and compose final prompts with `bundled/skills/_shared/shot-prompt-builder.md`.

## Asset Type Separation

scene_kind: news-screenshot MUST reference assets with provider = playwright_recording; scene_kind: lyric-art MUST reference image-gen tool assets. Mismatch is a critical violation (fake-news protection).

News screenshots are real, not generated. Mixing these creates fake-news content; do not do it.

## PS2 Prompt Modules

Use these modules as labeled prompt fragments. Combine only the modules that fit the scene and preserve the content-mode rules.

**Dark political rap**: dark political rap music video, low-poly city streets at night, cinematic rain, dramatic shadows, underground rap video energy

**Hyper cinematic**: hyper cinematic PS2 cutscene camera, dramatic low-angle shot, Dutch angle, tracking shot through fog, grainy motion blur

**News dystopian**: news dystopian skyline, CRT news screens, surveillance cameras, flashing headlines as unreadable light shapes, social unrest atmosphere

**Anime hybrid**: anime hybrid character staging with PS2 low-poly bodies, expressive silhouettes, cel-shaded edges, moody neon rim light

**VHS + PS2**: VHS + PS2 texture stack, compressed textures, visible polygon edges, CRT scanlines, tape noise, limited render distance

Do not overdescribe faces. The PS2 look works through silhouette, mood, lighting, camera movement, and nostalgia.

## Source Flyout Assets

Source flyouts are HUD overlays, not generated article screenshots. They may show publisher, headline, date, and a short evidence note pulled from source_review. They must reference the real captured screenshot or source URL.

## Process

1. Read scene_plan, capture_manifest, brief, script, and cuesheet.
2. For `scene_kind: news-screenshot`, attach the real screenshot captured by `playwright_recording`; do not call image generation.
3. For `scene_kind: lyric-art`, create image-generation prompts using the PS2 prompt modules and per-section accent colors.
4. Use Higgsfield/image-to-video only for approved hero lyric-art scenes where motion materially improves the beat.
5. In sample mode, keep scope to the `15-20 sec` no-caption PS2 sample and avoid full-episode batch generation.
6. Record `kind`, provider, model, prompt, cost, seed, scene_ref, and sample/full status for every asset. Keep content_mode and scene_kind cross-checks in review notes and the decision log.

## Quality Gate

- asset_manifest validates,
- no news screenshot uses an image-gen provider,
- no lyric-art scene points at `provider = playwright_recording`,
- every prompt includes PS2 treatment when appropriate,
- projected cost respects Sample-first is mandatory for any production estimated > $1 or > 15 min.
