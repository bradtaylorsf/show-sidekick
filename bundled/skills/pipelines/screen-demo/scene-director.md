---
name: "screen-demo-scene-director"
description: "Plan screen-demo scenes from capture_manifest evidence and Remotion scene-library choices."
applies_to: "pipelines/screen-demo"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Screen Demo Pipeline

## When To Use

Use this stage after capture_manifest exists. Convert demo steps into scenes that remain legible and truthful to the approved capture mode.

## Scene Library Catalog

Available scene-library choices include:

- `terminal_scene` for `synthetic_terminal` command, install, and terminal workflow demos.
- `screen_capture_scene` for real captured video or screenshot sequences.
- `callout_scene` for zooms, labels, highlights, and cursor emphasis.
- `title_scene` for brief section labels or setup cards.

Use `terminal_scene` only when the idea-stage mode is `synthetic_terminal`. Do not convert a real app UI into terminal_scene just because it is easier to render.

## Process

1. Map each demo step to one scene or scene group.
2. For synthetic terminal demos, define `terminal_scene` props: prompt, command, output, timing, cursor behavior, and hold duration.
3. For real captures, define start/end ranges, zoom moments, crop safety, and callout positions.
4. Keep one viewer question per scene: what changed, what command ran, what setting moved, or what result appeared.
5. Record any legibility risk before assets are prepared.

## Quality Gate

- every scene maps to capture_manifest evidence or terminal_scene props,
- terminal_scene appears when synthetic_terminal needs a terminal visual,
- real_capture scenes stay grounded in captured UI,
- screen text remains readable at target aspect ratio.
