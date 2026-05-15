---
name: "music-video-script-director"
description: "Create a lyric-aligned music-video script driven by whisper word timestamps."
applies_to: "pipelines/music-video"
stage: "script"
produces: "script"
---
# Script Director - Music Video Pipeline

## When To Use

Use this stage after the brief locks concept sections and source review confirms word timing.

## Timing Rule

NEVER guess timing from lyric structure alone — the whisper word timestamps drive caption timing.

Each section must cite cuesheet word timing, beat timing, or downbeat timing. Keep visual beats within the `5.0 seconds` scene duration cap.

## Process

1. Split the track into sections based on cuesheet sections, lyrics, and beat drops.
2. Name sections after actual concepts such as RAG, AGENTIC SEARCH, GRAPH DB, not generic verse labels.
3. Assign caption text only where word timestamps support it.
4. Mark beat-drop hype tags and the first vocal entry.
5. Record accent color and visual job per section.

## Quality Gate

- script validates,
- every caption phrase has a word timestamp source,
- section names are concept-specific,
- no scene-level beat exceeds 5.0 seconds.
