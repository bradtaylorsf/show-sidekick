---
name: "clip-factory-scene-director"
description: "Build scene_plan entries directly from scene_detect windows."
applies_to: "pipelines/clip-factory"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Clip Factory Pipeline

## When To Use

Use this stage after the brief selects clip strategy. There is no script stage: the source footage and scene_detect output drive the plan.

## Scene Detect Window Planning

Build the `scene_plan` from scene_detect output (S-1). Each scene_plan entry must reference a `(start, end)` window from scene_detect, plus any transcript phrase or visual beat that justifies the selection.

## Process

1. Convert selected candidate windows into planned clips.
2. For each clip, define hook, hold, exit, source start/end, target aspects, caption needs, and reframing risk.
3. Use transcript evidence for speech-led clips and frame samples for visual-led clips.
4. Mark where cuts can tighten a window without changing the source meaning.
5. Avoid generated support unless the clip needs a caption, title, or simple context card.

## Quality Gate

- every scene_plan entry references a scene_detect start/end window,
- every clip has a reason to exist,
- source meaning is preserved,
- aspect-ratio risks are ready for asset planning.
