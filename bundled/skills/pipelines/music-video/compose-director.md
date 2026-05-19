---
name: "music-video-compose-director"
description: "Render the music video with HyperFrames preference, locked runtime, and final self-review."
applies_to: "pipelines/music-video"
stage: "compose"
produces: "render_report"
---
# Compose Director - Music Video Pipeline

## When To Use

Use this stage after edit decisions are approved. Render the music-video sample or full production and write render_report plus final_review.

## HyperFrames Preference

HyperFrames intro animation > Higgsfield text-to-video for opening title cards. Read `.show-sidekick/skills/core/hyperframes.md` before HyperFrames work.

## Runtime Lock

Use the approved runtime from the decision log and edit decisions. silent runtime swap is a CRITICAL governance violation.

## Render Rules

- Keep canvas at `1080×1920 vertical (9:16)`.
- Preserve white-flash timing at `0.06s in / 0.18s out` and `0.65 opacity`.
- Preserve bottom mask `220px solid + 180px gradient` and top mask `110px solid + 90px gradient`.
- Verify captions are driven by whisper word timestamps.
- Trim generated clips to exact edit-decision durations and record `expected_duration_s`, `drift_s`, `drift_frames`, `drift_tolerance_s`, `within_tolerance`, and `clip_trims` in `render_report`.

## Process

1. Build or reuse the HyperFrames/Remotion workspace.
2. Render the sample or full video with registry-backed `video_compose`.
3. Run ffprobe or runtime validation and confirm render drift is within `drift_tolerance_frames`.
4. Spot-check title cards, masks, captions, white flashes, and hero motion.
5. Compare against Brad's reference music-video as the visual benchmark.

## Quality Gate

- render_report validates,
- output exists and probes cleanly,
- render drift is within `drift_tolerance_frames`,
- title cards use HyperFrames intro animation unless a logged decision says otherwise,
- runtime did not silently swap,
- final review records benchmark, caption, mask, and beat-drop checks.
