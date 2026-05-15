---
name: "music-video-scene-director"
description: "Build beat-aligned scenes, hype tags, white flashes, and quick-cut holds from cuesheet timing."
applies_to: "pipelines/music-video"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Music Video Pipeline

## When To Use

Use this stage after the script names lyric sections and timing anchors. Audio is the master clock.

## Beat-Drop Planning

Place hype tags `1.5-2 sec` before first vocal when the intro has room. Beat-drop hype tags between sections — name them after the actual concept (RAG, AGENTIC SEARCH, GRAPH DB), NOT generic VERSE 1/2/3.

White-flash transitions at major beat drops.

## Scene Duration

No scene may exceed `5.0 seconds`. Long holds (>5 sec) split into 2-3 quick cuts of the SAME image with different framing/scale.

## Process

1. Build scenes from cuesheet sections, downbeats, word timestamps, and climax points.
2. Assign per-section accent color — one color per character/concept.
3. Mark white-flash transitions at major beat drops.
4. Mark bottom and top mask needs for generated text or title plates.
5. Specify when hero scenes deserve Higgsfield image-to-video.

## Quality Gate

- all scenes validate and stay within 5.0 seconds,
- all captions and hype tags cite cuesheet timing,
- beat-drop hype tags use actual concept names,
- white-flash transitions are placed only on major drops.
