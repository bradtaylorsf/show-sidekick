---
name: "screen-demo-asset-director"
description: "Prepare captions, callouts, highlights, and scene props for screen-demo rendering."
applies_to: "pipelines/screen-demo"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Screen Demo Pipeline

## When To Use

Use this stage after the scene plan is approved. Prepare the assets the screen-demo render needs without faking product behavior.

## Process

1. Convert scene_plan entries into asset_manifest entries for captures, terminal props, callouts, cursors, captions, and overlays.
2. Use `frame_sampler` to verify real capture readability when a still frame can expose text or crop issues.
3. Use `video_understand` only to summarize real captured steps or identify visual state changes.
4. Use `subtitle_gen` when narration or on-screen captions are part of the approved demo.
5. Keep synthetic terminal assets editable as props instead of baking text into video prematurely.

## Quality Gate

- every asset maps to a demo step,
- callouts point to visible UI or terminal text,
- synthetic terminal props are complete,
- real capture support assets do not fake app state.
