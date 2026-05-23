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

1. Use the approved runtime decision and record any final runtime confirmation.
2. Render with VO as the master clock.
3. Verify readable slides, animated treatment, duration, drift, captions, and audio.
4. Run a motion-led verification check for zooms, callouts, rebuilds, support visuals, or other animated treatment.
5. Reject static slideshow playback as a failed compose outcome.

## Quality Gate

- `render_report` matches `schemas/artifacts/render_report.schema.json`.
- `final_review` confirms this is an animated explainer/demo, not a static slideshow.
- Duration and drift are recorded.
