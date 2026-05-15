---
name: "animated-explainer-scene-director"
description: "Convert the script into timed scenes and five-aspect visual intent."
applies_to: "pipelines/animated-explainer"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Animated Explainer Pipeline

## When To Use

Use this stage to translate approved VO into a timed scene plan.

## Shared Visual Contract

Every generated visual or reference-inspired shot must reference `bundled/skills/_shared/video-prompting.md`. Use `bundled/skills/_shared/shot-prompt-builder.md` when final prompts are needed.

## Process

1. Segment the script into scenes that follow VO meaning.
2. Choose one visual job per scene: define, compare, reveal, sequence, quantify, or recap.
3. Fill the five-aspect intent for scenes that need image or video generation.
4. Mark overlays separately from scene depth and reserve enough space for captions.
5. Keep motion legible: reveal concepts in order instead of animating everything at once.

## Output Contract

Produce a schema-valid `scene_plan` with scene durations, visual treatment, generation needs, overlay plan, and sample candidates.
