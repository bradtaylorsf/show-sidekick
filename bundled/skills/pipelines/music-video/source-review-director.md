---
name: "music-video-source-review-director"
description: "Inspect supplied music, lyrics, references, and transcription timing before creative planning."
applies_to: "pipelines/music-video"
stage: "source_review"
produces: "source_media_review"
---
# Source Review Director - Music Video Pipeline

## When To Use

Use this stage immediately after cuesheet creation. Confirm the supplied track, lyrics, references, and transcript timing before idea, script, or caption work depends on them.

## Whisper Timing

Use `medium.en` as the whisper default. Retry with `large-v3` when confidence is low, words are missing around dense vocals, or caption timing would otherwise be guessed.

NEVER guess timing from lyric structure alone — `lyrics_aligned` phrase windows and whisper word timestamps drive caption timing.

## Process

1. Inspect the track path, lyrics path, cuesheet duration, `lyrics_aligned` phrase windows, word timestamps, sections, beats, and climax points.
2. Compare supplied lyrics to the cuesheet words and note any manual alignment requirements in `lyrics_alignment_overrides.json`.
3. Record reference media or visual benchmark notes when provided.
4. Flag sections where vocals are unclear or timing needs the `large-v3` retry.
5. Produce `source_media_review` with concrete probe fields and planning implications.

## Quality Gate

- `source_media_review` validates,
- `lyrics_aligned` plus `medium.en` or `large-v3` timing source is named,
- every caption-critical lyric line has a timing source,
- no downstream stage is asked to infer timing from lyric structure alone.
