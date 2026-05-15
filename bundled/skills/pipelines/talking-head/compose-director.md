---
name: "talking-head-compose-director"
description: "Render talking-head deliverables with stable runtime, readable captions, and source-first framing."
applies_to: "pipelines/talking-head"
stage: "compose"
produces: "render_report"
---
# Compose Director - Talking Head Pipeline

## When To Use

Use this stage after edit decisions are approved. Render the talking-head output and final review package.

## Runtime Lock

Use `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Render source footage, captions, support overlays, and audio mix through `video_compose` and `audio_mixer`.
2. Verify mouth-readable subtitle timing against the transcript.
3. Check that captions do not cover the speaker's mouth, eyes, or key gestures.
4. Validate output duration, resolution, codec, audio, and deliverable variants.
5. Record transcript model/version and any subtitle caveats in `render_report`.

## Quality Gate

- output exists and passes ffprobe validation,
- runtime matches edit decisions,
- subtitle sync tolerance ±0.3s is preserved,
- presenter remains the primary visual.
