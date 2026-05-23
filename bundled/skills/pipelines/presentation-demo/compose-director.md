---
name: "presentation-demo-compose-director"
description: "Render and verify the animated explainer/demo output."
applies_to: "pipelines/presentation-demo"
stage: "compose"
produces: "render_report"
---
# Compose Director - Presentation Demo

## Goal

Render an animated explainer/demo video and produce `render_report.json` plus `final_review.json`.

## Workflow

1. Use the runtime locked in the approved proposal/edit decisions. Default to Remotion; use HyperFrames only when the proposal/edit decision explicitly locked HyperFrames.
2. Refuse silent runtime swaps. If the locked runtime is unavailable, stop and surface the blocker instead of falling back to FFmpeg/static slideshow output.
3. Render slide-image scenes with zoom/pan motion, highlight rectangles, callouts, captions, and support-visual treatments from `scene_plan` and `edit_decisions`.
4. Include approved narration audio when present and keep VO as the master clock.
5. Verify readable slides, delivery-size text, animated treatment, duration, expected duration, drift, captions, audio, output path, and runtime used.
6. Run a motion-led verification check for zooms, callouts, rebuilds, support visuals, or other animated treatment.
7. Reject static slideshow playback as a failed compose outcome.

## Quality Gate

- `render_report` matches `schemas/artifacts/render_report.schema.json`.
- `final_review` confirms this is an animated explainer/demo, not a static slideshow.
- Runtime, output path, duration, expected duration, drift, and verification notes are recorded.
