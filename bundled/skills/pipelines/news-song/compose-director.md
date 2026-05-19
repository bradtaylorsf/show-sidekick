---
name: "news-song-compose-director"
description: "Render the news-song sample or full rough cut with HyperFrames preference and source/art separation checks."
applies_to: "pipelines/news-song"
stage: "compose"
produces: "render_report"
---
# Compose Director - News Song Pipeline

## When To Use

Use this stage after edit decisions are approved. Render the 15-20 sec no-caption PS2 sample or the full news-song rough cut and write render_report plus final_review.

## HyperFrames Preference

Use HyperFrames for HUD/source flyouts, title cards, and compositing when available. Read `.show-sidekick/skills/core/hyperframes.md` before HyperFrames work.

## Runtime Lock

Use the approved runtime from the decision log and edit decisions. silent runtime swap is a CRITICAL governance violation.

## Render Rules

- Keep the master canvas at `1920×1080 landscape (16:9)` and preserve the vertical derivative plan.
- Preserve caption_mode none for the `15-20 sec` no-caption PS2 sample unless a logged decision says otherwise.
- Keep every visual scene at or under `5.0 seconds`.
- Keep real screenshot layers and generated lyric-art layers labeled separately.
- Trim generated clips to exact edit-decision durations and record `expected_duration_s`, `drift_s`, `drift_frames`, `drift_tolerance_s`, `within_tolerance`, and `clip_trims` in `render_report`.
- News screenshots are real, not generated. Mixing these creates fake-news content; do not do it.

## Process

1. Build or reuse the HyperFrames/Remotion workspace.
2. Render the sample or full video with registry-backed `video_compose`.
3. Run ffprobe or runtime validation and confirm render drift is within `drift_tolerance_frames`.
4. Spot-check source flyouts, screenshots, PS2 texture treatment, no-caption sample behavior, and scene duration.
5. Write final_review with content mode, type-separation, sample-first, and runtime-lock checks.

## Quality Gate

- render_report validates,
- output exists and probes cleanly,
- render drift is within `drift_tolerance_frames`,
- runtime did not silently swap,
- no-caption sample has no lyric captions,
- final review confirms real source screenshots and generated lyric-art stayed separate.
