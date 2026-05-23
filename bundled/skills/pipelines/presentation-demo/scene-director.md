---
name: "presentation-demo-scene-director"
description: "Plan animated slide-aware scenes from approved narration and deck manifest."
applies_to: "pipelines/presentation-demo"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Presentation Demo Pipeline

## Goal

Produce a `scene_plan` that maps approved narration to source slides, slide ranges, or support visuals.

## Motion Requirement

Output must be an animated explainer/demo, not a static slideshow. Use motion, zooms, ken-burns moves, callouts, diagram rebuilds, object highlights, scene rebuilds, or support visuals when they make the explanation clearer.

## Process

1. Read `script`, `deck_manifest`, and `cuesheet`.
2. Map every narrated section to one or more `slide_id`s or an approved support visual.
3. Preserve source meaning, slide order, and operator direction.
4. Plan motion that explains relationships, sequence, contrast, or emphasis.
5. Flag any slide whose extraction warning makes the planned scene risky.

## Output Contract

Produce a schema-valid `scene_plan` with timing, visual treatment, slide mapping, and required assets for every scene.
