---
description: "Render presentation-demo scenes with slide-aware Remotion or explicitly locked HyperFrames composition."
stage: compose
produces: "render_report"
---

# Presentation Demo Compose Director

## Runtime Lock

Use the runtime already locked in proposal/edit decisions. Remotion is the deterministic default for presentation-demo. HyperFrames is valid only when the proposal or edit decisions explicitly lock `render_runtime: hyperframes` for a specific treatment.

Do not silently swap runtimes. If `edit_decisions.render_runtime` is `remotion`, compose with Remotion. If it is `hyperframes`, compose with HyperFrames. If the selected runtime is unavailable, stop and surface a compose blocker instead of falling back to a static slideshow or ffmpeg.

## Slide Motion Contract

Every scene must map to a deck slide or declared support visual. Use slide-aware treatments in `edit_decisions.cuts[]`:

- `scene_type: slide_image` for the source slide screenshot.
- `slide_id` matching `deck_manifest.slides[].id`.
- `treatment.motion` with `zoom_pan`, `push_in`, `pull_out`, `pan`, or `support_visual`; `static` is allowed only with a callout/highlight/support visual.
- `treatment.highlights[]` for normalized slide rectangles.
- `treatment.callouts[]` for readable explanatory overlays.
- `treatment.caption` or subtitles/cuesheet word timings when captions are present.
- `treatment.support_visuals[]` for diagrams or simple inserts that clarify the slide.

A sequence of unchanged slide screenshots is a delivery-promise downgrade. Revise edit decisions before rendering if most slide scenes have `motion.kind: static` and no callouts, highlights, captions, or support visuals.

## Render Report

Write a schema-valid `render_report.json` with:

- `runtime_used`
- `output_path`
- `duration_s`
- `expected_duration_s`
- `drift_s`
- `drift_frames`
- `drift_tolerance_s`
- `within_tolerance`
- `validation_steps[]` including slide mapping, caption sync, render drift, and runtime-lock checks

Include narration audio from `cuesheet.audio.path` when present. Include captions from `edit_decisions.subtitles` or cuesheet word timings when present. Ensure text remains readable at the delivery resolution.
