---
name: "avatar-spokesperson-compose-director"
description: "Render avatar-spokesperson outputs with audio, captions, and support graphics."
applies_to: "pipelines/avatar-spokesperson"
stage: "compose"
produces: "render_report"
---
# Compose Director - Avatar Spokesperson Pipeline

## When To Use

Use this stage after edit decisions are approved. Render the avatar, lip-sync, or narration-over-graphics outputs.

## Runtime Lock

Use `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Render avatar video, presenter plate, or graphics-led scenes with `video_compose`.
2. Mix avatar audio, TTS, music bed, or source audio with `audio_mixer`.
3. Apply captions and support overlays without covering the face, mouth, eyes, or product evidence.
4. Validate output duration, audio sync, caption timing, crop safety, codec, and aspect ratio.
5. Record pivot path, runtime, provider metadata, output paths, and caveats in `render_report`.

## Quality Gate

- output files exist and pass ffprobe validation,
- audio and captions remain synced,
- presenter readability is preserved,
- pivot path and caveats are present in render metadata.
