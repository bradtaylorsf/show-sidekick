---
name: "news-song-cuesheet-director"
description: "Build the audio timing map for no-caption PS2 news-song samples and full source-backed cuts."
applies_to: "pipelines/news-song"
stage: "cuesheet"
produces: "cuesheet"
---
# Cuesheet Director - News Song Pipeline

## When To Use

Use this stage first. Audio is the master clock even when the first output is a no-caption PS2 sample.

## Timing Requirements

- Build word timestamps, section boundaries, beats, downbeats, and climax points.
- Keep the first sample scoped to `15-20 sec` when sample mode is active.
- Preserve word timestamps even when caption_mode is none; source flyouts, cuts, and HUD beats still need lyric timing.
- No planned scene downstream may exceed `5.0 seconds`.

## Content Mode Awareness

`sourced-political-news-song` uses word timing to place source flyouts after claims. `source-free-protest-music-video` uses word timing for cuts and image beats without implying source evidence.

## Process

1. Inspect the supplied track and lyrics.
2. Generate or validate the cuesheet with word timestamps and beat grid.
3. Mark candidate 15-20 sec no-caption PS2 sample windows with strong lyric, beat, and visual contrast.
4. Identify any phrase that may need a source flyout if the episode is sourced.
5. Record timing confidence and any retry requirement before source review.

## Quality Gate

- cuesheet validates,
- words and beats are present,
- the sample window can support a 15-20 sec no-caption PS2 preview,
- source flyout timing candidates are tied to words, beats, or downbeats.
