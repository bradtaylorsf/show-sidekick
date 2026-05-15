---
name: "screen-demo-compose-director"
description: "Render real or synthetic screen-demo scenes with audio, captions, and callouts."
applies_to: "pipelines/screen-demo"
stage: "compose"
produces: "render_report"
---
# Compose Director - Screen Demo Pipeline

## When To Use

Use this stage after edit decisions are approved. Render the screen-demo outputs.

## Runtime Lock

Use `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Render real captures or synthetic `terminal_scene` scenes with `video_compose`.
2. Mix narration, screen audio, music bed, or silence with `audio_mixer` according to edit decisions.
3. Apply captions, callouts, cursor highlights, and zooms without covering important UI.
4. Validate readability at each target aspect ratio before marking the render complete.
5. Record capture mode, runtime, scene library, output path, and caveats in `render_report`.

## Quality Gate

- output files exist and pass ffprobe validation,
- terminal_scene text and real capture UI remain readable,
- captions and callouts match timing,
- capture mode is visible in render metadata.
