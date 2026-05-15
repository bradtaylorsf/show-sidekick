---
name: "animated-explainer-compose-director"
description: "Render the explainer with approved runtime, VO timing, and legible graphics."
applies_to: "pipelines/animated-explainer"
stage: "compose"
produces: "render_report"
---
# Compose Director - Animated Explainer Pipeline

## When To Use

Use this stage to render the approved timeline and run final self-review.

## Shared Visual Contract

Check generated visuals against `bundled/skills/_shared/video-prompting.md` before final render.

## Runtime Lock

Use the render runtime from `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation. Remotion is the default explainer runtime; read `bundled/skills/core/remotion.md` before composing React scenes.

## Process

1. Build the composition workspace with assets, VO, captions, and scene metadata.
2. Compose scenes in the approved runtime, typically Remotion for explainers.
3. Verify text safe areas, caption timing, VO sync, and diagram readability.
4. Render one sample segment when requested before full export.
5. Inspect spot frames and audio duration before marking complete.

## Output Contract

Produce a schema-valid `render_report` and `final_review` with output path, duration, resolution, runtime, validation notes, and known caveats.
