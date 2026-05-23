---
name: "presentation-demo-compose-director"
description: "Compose the animated presentation demo and validate timing and runtime."
applies_to: "pipelines/presentation-demo"
stage: "compose"
produces: "render_report"
---
# Compose Director - Presentation Demo Pipeline

## Goal

Render the approved presentation demo and produce `render_report` plus `final_review`.

## Motion Requirement

Output must be an animated explainer/demo, not a static slideshow. Use the selected runtime to animate slide images, rebuild key ideas, zoom to details, add callouts, reveal diagrams, and align captions to narration.

## Governance

silent runtime swap is a CRITICAL governance violation. If Remotion, HyperFrames, or another selected runtime is unavailable, stop and record the fallback decision before composing.

## Process

1. Read `edit_decisions`, `asset_manifest`, `deck_manifest`, `cuesheet`, and scene plan context.
2. Render with the approved runtime and voiceover timing.
3. Validate output path, duration, drift, framerate, runtime, asset count, and warnings.
4. Confirm the render is not a static slideshow.

## Output Contract

Produce a schema-valid `render_report` and `final_review` that name runtime, duration, drift, validation steps, and any deck extraction caveats.
