---
name: self-review-of-output
description: Run the final rendered-output review before presenting compose output to the user.
applies_to: meta
cross_refs:
  - specs/17-self-review-of-output.md
  - bundled/skills/meta/reviewer.md
---
# Self-Review Of Rendered Output

Run this after `compose` produces a render and before showing the output to the user. The result is a `final_review` artifact attached to the compose checkpoint.

## Required Checks

| Check | What it confirms | Severity if it fails |
|---|---|---|
| `technical_probe` | File opens; container is valid; duration, resolution, framerate, codecs match the proposal | critical |
| `visual_spotcheck` | Sampled frames show planned content, characters, brand, and no missing assets | critical or suggestion |
| `audio_spotcheck` | Narration/music/SFX presence matches the promise; no clipping or unexpected silence | critical or suggestion |
| `promise_preservation` | Delivery promise is honored; no silent still-led downgrade; no unlogged runtime swap | critical |
| `subtitle_check` | Captions/subtitles exist when declared; word-level timing is accurate when requested | suggestion, critical if severe |

## Protocol

1. Run ffprobe on the rendered file.
2. Sample at least four frames across the timeline: roughly 10%, 35%, 65%, and 90%. Sample one extra frame inside the hero/climax scene when one exists.
3. Check audio stream presence and inspect short windows at the start, middle, and end.
4. Read the proposal delivery promise and compare it against the render.
5. If captions are present or required, verify timing against the transcript/cuesheet.
6. Produce the final_review artifact with pass/revise/fail status and recommended action.

## Threshold Table

| Check | Pass threshold | Suggestion below | Critical below |
|---|---|---|---|
| `visual_spotcheck.frames_sampled` | >= 4 | n/a | < 4 |
| `audio_spotcheck.caption_sync_accuracy` | >= 0.95 | < 0.95 | < 0.80 |
| `subtitle_check.accuracy_within_150ms` | >= 0.95 | < 0.95 | < 0.80 |
| `promise_preservation.motion_ratio_actual` for motion-led briefs | >= 0.70 | < 0.70 | < 0.50 |
| `transcript_comparison.word_accuracy` when script exists | >= 0.80 | < 0.80 | n/a |

Any `silent_downgrade_detected: true` or unapproved `runtime_swap_detected: true` is critical regardless of other scores.

## Halt-On-Fail Rule

- `pass` means present the render to the user.
- `revise` means fix or re-render when the issue is cheaply recoverable.
- `fail` means halt. Preserve the failed render for inspection, show the issues, and ask how to proceed.

Do not publish or hand off a render that failed final self-review unless the user explicitly forces approval and that override is logged.

## Artifact Skeleton

```json
{
  "status": "pass",
  "checks": {
    "technical_probe": {},
    "visual_spotcheck": { "frames_sampled": 5, "findings": [] },
    "audio_spotcheck": { "narration_present": true, "music_present": true, "findings": [] },
    "promise_preservation": {
      "delivery_promise_honored": true,
      "silent_downgrade_detected": false,
      "runtime_swap_detected": false,
      "runtime_swap_check": "ok - proposal=remotion, edit=remotion, render=remotion",
      "motion_ratio_actual": 0.82,
      "render_runtime_used": "remotion",
      "findings": []
    },
    "subtitle_check": { "present": true, "accuracy_within_150ms": 0.98 }
  },
  "issues_found": [],
  "recommended_action": "present_to_user"
}
```
