---
name: "news-song-edit-director"
description: "Build the no-caption PS2 news-song edit with source flyouts, quick cuts, and runtime lock."
applies_to: "pipelines/news-song"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - News Song Pipeline

## When To Use

Use this stage after the asset manifest exists. Build cuts, source flyouts, overlays, motion notes, and runtime decisions from cuesheet timing.

## Runtime Lock

Use the approved runtime. silent runtime swap is a CRITICAL governance violation.

## Caption Mode

The sample default is no lyric captions. Keep caption_mode none for the `15-20 sec` no-caption PS2 sample unless the human explicitly changes it.

## Source Flyout HUD Timing

Use source flyout HUD timing rules: enter after the claim lands, keep publisher/headline/date readable, and exit before the next vocal phrase or major cut. Do not cover the source masthead or headline on real screenshots.

## Scene Duration

No visual scene may exceed `5.0 seconds`. Long holds over 5.0 seconds split into quick cuts with scale, crop, angle, or a fresh source/lyric-art beat.

## Type-Separation Review

scene_kind: news-screenshot MUST reference assets with provider = playwright_recording; scene_kind: lyric-art MUST reference image-gen tool assets. Mismatch is a critical violation (fake-news protection).

## Process

1. Cut to cuesheet beats, sections, downbeats, and word timestamps.
2. Keep source flyouts tied to sourced claims and source records.
3. Keep source-free protest edits entirely lyric-art unless a new sourced mode is approved.
4. Preserve per-section accent color in HUD, transition, and emphasis notes.
5. Preserve the approved runtime and record any requested change before compose.

## Quality Gate

- edit_decisions validates,
- runtime stays locked,
- no-caption sample has no lyric captions,
- source flyout timing is readable,
- no scene exceeds the approved scene duration rule.
