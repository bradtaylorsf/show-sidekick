---
name: "podcast-repurpose-compose-director"
description: "Render podcast clips, captions, audio mix, and reframed variants."
applies_to: "pipelines/podcast-repurpose"
stage: "compose"
produces: "render_report"
---
# Compose Director - Podcast Repurpose Pipeline

## When To Use

Use this stage after edit decisions are approved. Render each podcast clip and platform variant.

## Runtime Lock

Use `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Podcast Render Checks

Use `video_compose` for picture, captions, and overlays. Use `audio_mixer` to preserve or normalize podcast audio without changing the timing that the transcript and captions rely on.

## Process

1. Render clips with `video_compose` and mix or preserve audio with `audio_mixer`.
2. Apply subtitles, speaker labels, title cards, and CTAs without hiding faces or important gestures.
3. Render target variants: `16:9`, `9:16`, `1:1`, or the platform-specific aspects approved in the brief.
4. Validate duration, resolution, codec, audio, captions, and speaker focus for each output.
5. Record source window, chapter id, variant, and render path in `render_report`.

## Quality Gate

- output files exist and pass ffprobe validation,
- every variant preserves the selected source moment,
- captions remain readable,
- podcast audio remains synced to transcript timing.
