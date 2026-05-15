---
name: "talking-head-scene-director"
description: "Plan presenter-led scenes, support inserts, captions, and framing-safe layouts."
applies_to: "pipelines/talking-head"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Talking Head Pipeline

## When To Use

Use this stage after the script is approved. Preserve the talking-head source as the primary visual and plan support layers around it.

## Shared Visual Contract

For any generated b-roll, diagram insert, or visual metaphor, read `bundled/skills/_shared/video-prompting.md` and keep generated support clearly separate from source footage.

## Process

1. Map script sections to source time ranges or support inserts.
2. Mark framing-safe caption regions that avoid the mouth and eyes.
3. Use `scene_detect` and `frame_sampler` when source cuts or visual continuity are uncertain.
4. Specify support assets only where they clarify the presenter.
5. Mark any generated b-roll as support, not source evidence.

## Quality Gate

- every scene maps to reviewed source or a justified support insert,
- captions have safe placement,
- generated support does not imply source coverage that does not exist,
- scene timings support subtitle sync tolerance ±0.3s.
