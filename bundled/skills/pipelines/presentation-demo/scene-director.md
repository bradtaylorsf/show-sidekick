---
name: "presentation-demo-scene-director"
description: "Plan motion-led scenes from slide evidence and VO timing."
applies_to: "pipelines/presentation-demo"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Presentation Demo

## Goal

Produce `scene_plan.json` that turns deck content into an animated explainer/demo.

## Workflow

1. Use VO timing from `cuesheet` as the master clock.
2. Map every scene to one or more `deck_manifest` slide IDs or an explicit support visual.
3. Add motion treatment: reveals, zooms, callouts, comparison layouts, cursor-like emphasis, transitions, diagrams, or data motion.
4. Use motion, zooms, callouts, comparison layouts, rebuilds, or support visuals; never produce a static slide playback.
5. Preserve deck meaning while avoiding static slide playback.

## Quality Gate

- The artifact matches `schemas/artifacts/scene_plan.schema.json`.
- Every scene has deck evidence or a support-visual reason.
- Scene pacing follows VO timing rather than slide count.
