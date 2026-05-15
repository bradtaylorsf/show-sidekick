---
name: "clip-factory-asset-director"
description: "Prepare clip-window assets, captions, and reframed variants from scene_detect output."
applies_to: "pipelines/clip-factory"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Clip Factory Pipeline

## When To Use

Use this stage after the scene plan is approved. Prepare source clip windows, caption assets, reframed variants, and only the support assets the clip plan requires.

## Scene Detect Window Selection

Clip windows are selected from scene_detect output, not generated freshly.

Asset stage uses scene_detect output (S-1) to select clip windows. If a better cut point is needed, trim within the reviewed window and record the reason; do not invent a clip that the source review did not identify.

## Auto-Reframe Cross-Reference

Use `auto_reframe` for aspect-ratio variants (G-4) when the selected window needs `9:16`, `1:1`, or other platform crops. Record whether smart crop or center fallback was used.

Reference `bundled/skills/_shared/video-prompting.md` only if a support card or generated visual insert is explicitly approved.

## Process

1. Create asset entries for each selected source window with start/end, source file, clip id, target aspect, and selection rationale.
2. Generate captions from transcript windows when speech is present.
3. Run or plan `auto_reframe` for each target aspect where crop risk exists.
4. Keep support assets minimal: title card, lower third, CTA, or context card.
5. Store source-window metadata so edit, compose, and publish can audit every clip.

## Quality Gate

- every asset maps to a scene_detect window,
- auto_reframe decisions are recorded for variants,
- captions and support assets map to selected windows,
- every referenced file exists or has a concrete generation task.
