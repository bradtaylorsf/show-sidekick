---
name: "clip-factory-compose-director"
description: "Render source-window clips, captions, and auto-reframed variants."
applies_to: "pipelines/clip-factory"
stage: "compose"
produces: "render_report"
---
# Compose Director - Clip Factory Pipeline

## When To Use

Use this stage after edit decisions are approved. Render each clip and platform variant.

## Runtime Lock

Use `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Auto-Reframe Variants

Use `auto_reframe` for output deliverable variants when the edit decisions call for cropped platform outputs. Verify that the speaker, product, or key action remains visible after reframing.

## Process

1. Render clips with `video_compose` and mix or preserve audio with `audio_mixer`.
2. Apply subtitles and title/CTA overlays without hiding important source content.
3. Render target variants: `16:9`, `9:16`, `1:1`, or the platform-specific aspects approved in the brief.
4. Validate duration, resolution, codec, audio, captions, and crop focus for each output.
5. Record source window, variant, and render path in `render_report`.

## Quality Gate

- output files exist and pass ffprobe validation,
- every variant preserves the selected source moment,
- auto_reframe outputs keep focus intact,
- captions remain readable.
