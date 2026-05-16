---
name: "music-video-edit-director"
description: "Build beat-synced edit decisions with white flashes, quick-cut holds, masks, and caption timing."
applies_to: "pipelines/music-video"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Music Video Pipeline

## When To Use

Use this stage after the asset manifest exists. Build the timing, cuts, captions, overlays, masks, transitions, and runtime lock.

## Runtime Lock

Use the approved runtime. silent runtime swap is a CRITICAL governance violation.

## White-Flash Transition

White-flash transitions at major beat drops use `0.06s in / 0.18s out` at `0.65 opacity`.

## Hold Splitting

Long holds (>5 sec) split into 2-3 quick cuts of the SAME image with different framing/scale.

## Timing Anchors

Every cut must preserve the scene's `timing_anchor`, `timing_source`, and `timing_ref` so NLE exports can trace the cut back to a lyric phrase, word, beat, climax, or manual correction. Do not create cuts inside a cuesheet word span unless the cut is explicitly marked `timing_source: manual` with a manual `timing_ref`.

## Mask Placement

Bottom mask + top mask to hide Imagen text-rendering artifacts: `220px solid + 180px gradient` bottom, `110px solid + 90px gradient` top.

## Process

1. Cut to `lyrics_aligned` phrase windows, cuesheet beats, and word timestamps.
2. Keep caption timings driven by `lyrics_aligned` phrase windows and whisper word timestamps.
3. Place white flashes only at major beat drops.
4. Split long holds into quick cuts with scale, crop, or framing changes.
5. Preserve the approved runtime and record any requested change before compose.

## Quality Gate

- edit_decisions validates,
- captions follow `lyrics_aligned` phrase windows or word timestamps,
- every cut preserves `timing_anchor`, `timing_source`, and `timing_ref`,
- no lyric timing is guessed when phrase windows are available,
- white flashes use 0.06s in / 0.18s out at 0.65 opacity,
- no cut exceeds the approved scene duration rule without quick-cut treatment,
- runtime stays locked.
