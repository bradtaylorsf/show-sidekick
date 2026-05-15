---
name: "news-song-source-review-director"
description: "Validate news-song content mode, sources, lyrics, and timing before concept work."
applies_to: "pipelines/news-song"
stage: "source_review"
produces: "source_media_review"
---
# Source Review Director - News Song Pipeline

## When To Use

Use this stage after cuesheet creation and before the idea lock. It decides whether the episode is sourced evidence work or source-free protest imagery.

## Content Mode Check

The allowed modes are `sourced-political-news-song` and `source-free-protest-music-video`.

For `sourced-political-news-song`, require a source list such as `sources.yaml`, exact URLs, publisher/source names, dates, and claim notes. For `source-free-protest-music-video`, record that no source screenshots will be used and that no fake news evidence may be implied.

## Deep URL Rule

Use Shell's Love Tap learning (deep-URL specificity): source records should point to the actual article, filing, report, chart, transcript, or official data page. Do not send capture to homepages, broad search pages, topic pages, or vague social posts when the claim depends on a specific source.

## Browser-Blocked Sources

Use the BLS/FRED browser-block note: if BLS, FRED, or another official site blocks browser automation, record the blocker and select an allowed alternate evidence representation. Never synthesize a screenshot to compensate.

News screenshots are real, not generated. Mixing these creates fake-news content; do not do it.

## Process

1. Inspect track, lyrics, cuesheet timing, any source list, and any user brief.
2. Lock `content_mode` and record the reason.
3. Validate deep URLs for sourced mode and flag missing or vague sources.
4. Mark which lyric claims need source flyouts or screenshots.
5. For source-free mode, explicitly state that only `scene_kind: lyric-art` is allowed.
6. Produce `source_media_review` with timing, mode, source, and planning implications.

## Quality Gate

- source_media_review validates,
- content mode is named,
- sourced work has exact source URLs or clear blockers,
- source-free work has no implied factual source evidence.
