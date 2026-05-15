---
name: "animation-scene-director"
description: "Plan scenes, motion grammar, and generated visual intent."
applies_to: "pipelines/animation"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Animation Pipeline

## When To Use

Use this stage to turn script sections into animatable scenes.

## Shared Visual Contract

Use `bundled/skills/_shared/video-prompting.md` for generated visual intent and `bundled/skills/_shared/shot-prompt-builder.md` when composing shot prompts.

## Process

1. Map every script section to one scene or one clear subscene.
2. Define the motion grammar: CSS/Remotion primitive, Lottie/vector, GSAP timeline, or generated clip.
3. Fill five-aspect notes for any generated visual.
4. Mark overlays separately from scene depth.
5. Keep motion readable: one main change at a time.

## Output Contract

Produce a schema-valid `scene_plan` with timings, scene anchors, motion grammar, and required assets.
