---
name: "music-video-asset-director"
description: "Create music-video image and hero motion assets with mask, cost, and provider governance."
applies_to: "pipelines/music-video"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Music Video Pipeline

## When To Use

Use this stage after beat-aligned scene planning. Build generated images, masks, hero motion clips, and any reusable title or concept assets.

For generated shot prompts, use the shared five-aspect framework in `bundled/skills/_shared/video-prompting.md` and compose final prompts with `bundled/skills/_shared/shot-prompt-builder.md`.

## Mask Defaults

Bottom mask + top mask to hide Imagen text-rendering artifacts. Use `220px solid + 180px gradient` at the bottom and `110px solid + 90px gradient` at the top.

## Hero Motion Governance

Higgsfield image-to-video for hero scene animations only.

Kling cost assumption: `$0.30/clip`.

Read `.show-sidekick/skills/agents/higgsfield-generate.md` before any Higgsfield call and `.show-sidekick/skills/meta/announce-and-escalate.md` before paid generation.

## Process

1. Build still image prompts from scene_plan and the shared prompt helpers.
2. Add bottom and top masks to generated title-like plates before edit.
3. Use Higgsfield image-to-video only for hero scenes where motion materially improves the beat.
4. Use `clip_cache` to avoid duplicate paid clips when prompts, providers, and models repeat.
5. Record provider, model, prompt, cost, seed, scene_ref, and sample/full status for every asset.

## Quality Gate

- asset_manifest validates,
- every generated image has prompt metadata,
- mask dimensions are present when generated text artifacts are possible,
- hero motion clips are limited to approved hero scenes,
- projected generation cost respects sample-first governance.
