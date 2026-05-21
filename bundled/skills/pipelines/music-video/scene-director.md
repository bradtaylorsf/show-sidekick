---
name: "music-video-scene-director"
description: "Build beat-aligned scenes, hype tags, white flashes, and quick-cut holds from cuesheet timing."
applies_to: "pipelines/music-video"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Music Video Pipeline

## When To Use

Use this stage after the script names lyric sections and timing anchors. Audio is the master clock, and `lyrics_aligned` phrase windows are the lyric timing source when present.

## Beat-Drop Planning

Place hype tags `1.5-2 sec` before first vocal when the intro has room. Beat-drop hype tags between sections — name them after the actual concept, NOT generic VERSE 1/2/3.

White-flash transitions at major beat drops.

## Scene Duration

No scene may exceed `5.0 seconds`. Long holds (>5 sec) split into 2-3 quick cuts of the SAME image with different framing/scale.

## Timing Anchors

Every music-led scene must carry `timing_anchor`, `timing_source`, and `timing_ref`. For lyric scenes, set `timing_source: lyric`, copy the exact `lyrics_aligned` `start_ms` and `end_ms`, and set `timing_ref.lyric_line_id` to the source line id. If a lyric phrase window is longer than `5.0 seconds`, split it into multiple adjacent scenes inside the same phrase window and keep each child scene tied to the same `lyric_line_id`.

## Process

1. Build scenes from `lyrics_aligned` phrase windows, cuesheet sections, downbeats, word timestamps, and climax points.
2. Assign per-section accent color — one color per character/concept.
3. Mark white-flash transitions at major beat drops.
4. Mark bottom and top mask needs for generated text or title plates.
5. Specify when hero scenes deserve Higgsfield image-to-video.

## Quality Gate

- all scenes validate and stay within 5.0 seconds,
- all captions and hype tags cite `lyrics_aligned` phrase windows or cuesheet timing,
- every scene has `timing_anchor`, `timing_source`, and `timing_ref`,
- no lyric timing is guessed when phrase windows are available,
- beat-drop hype tags use actual concept names,
- white-flash transitions are placed only on major drops.
