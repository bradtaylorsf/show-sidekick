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

## Mask Placement

Bottom mask + top mask to hide Imagen text-rendering artifacts: `220px solid + 180px gradient` bottom, `110px solid + 90px gradient` top.

## Process

1. Cut to cuesheet beats and word timestamps.
2. Keep caption timings driven by whisper word timestamps.
3. Place white flashes only at major beat drops.
4. Split long holds into quick cuts with scale, crop, or framing changes.
5. Preserve the approved runtime and record any requested change before compose.

## Quality Gate

- edit_decisions validates,
- captions follow word timestamps,
- white flashes use 0.06s in / 0.18s out at 0.65 opacity,
- no cut exceeds the approved scene duration rule without quick-cut treatment,
- runtime stays locked.
