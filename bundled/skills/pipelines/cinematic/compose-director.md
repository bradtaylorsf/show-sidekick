---
name: "cinematic-compose-director"
description: "Render the cinematic rough cut while preserving runtime, motion, and audio architecture."
applies_to: "pipelines/cinematic"
stage: "compose"
produces: "render_report"
---
# Compose Director - Cinematic Pipeline

## When To Use

Use this stage after edit decisions are approved. Render the rough cut and create the final review artifact.

## Runtime Lock

Use `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation. Read `bundled/skills/core/remotion.md` before composing in Remotion or passing React scene work to `video_compose`.

## Process

1. Assemble video, speech, music, ambience, subtitles, and overlays according to `edit_decisions`.
2. Use `video_compose` and `audio_mixer` through the registry.
3. Verify duration, resolution, codec, audio loudness, caption readability, and motion playback.
4. Preserve prompt metadata and source clip references in the render report.
5. Produce `final_review` notes for cinematic promise, motion quality, and audio architecture.

## Quality Gate

- output exists and passes ffprobe validation,
- runtime matches edit decisions,
- motion clips play without still fallback,
- captions and overlays do not obscure the scene depth.
