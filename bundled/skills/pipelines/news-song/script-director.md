---
name: "news-song-script-director"
description: "Create a lyric/source treatment whose cuts and source flyouts are driven by cuesheet timing."
applies_to: "pipelines/news-song"
stage: "script"
produces: "script"
---
# Script Director - News Song Pipeline

## When To Use

Use this stage after the brief locks content mode, concept, sample scope, and source policy.

## Timing Rule

Every lyric section, source flyout, and evidence beat must cite cuesheet word timing, beat timing, or downbeat timing. Keep scene-level beats within the `5.0 seconds` scene duration cap.

## Content Mode Rules

For `sourced-political-news-song`, pair source flyouts only with real source records and prepare the capture stage to gather publisher screenshots. For `source-free-protest-music-video`, write purely lyric-driven visual beats and do not imply an article, agency page, or screenshot exists.

News screenshots are real, not generated. Mixing these creates fake-news content; do not do it.

## Process

1. Split the track into sections based on cuesheet sections, lyrics, beat drops, and claims.
2. Name sections after actual concepts or arguments, not generic verse labels.
3. Mark each beat as `scene_kind: news-screenshot` or `scene_kind: lyric-art`.
4. Attach source refs only to news-screenshot beats in sourced mode.
5. Keep the sample script to a 15-20 sec no-caption PS2 preview when sample mode is active.
6. Record per-section accent color and source flyout copy.

## Quality Gate

- script validates,
- every source flyout cites a real source ref,
- source-free script has no `scene_kind: news-screenshot`,
- no scene-level beat exceeds 5.0 seconds.
