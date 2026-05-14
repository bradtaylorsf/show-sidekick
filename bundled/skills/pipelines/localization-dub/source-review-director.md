---
name: "localization-dub-source-review-director"
description: "Inspect source video before localization planning and translation."
applies_to: "pipelines/localization-dub"
stage: "source_review"
produces: "source_media_review"
---
# Source Review Director - Localization Dub Pipeline

## When To Use

Run this first for the existing source video. Localization quality depends on knowing what speech, on-screen text, music, and visible-mouth sections are actually present before translation starts.

## Process

### 1. Probe The Source Video

Use the registry tool `source_media_review` for the source video. Add transcription, frame sampling, or scene detection when it helps identify speech-bearing sections, baked-in captions, or visible-mouth shots.

### 2. Ground The Source Summary

Each summary must cite technical probe fields such as duration_seconds, resolution, codec, audio streams, or frame-rate details. Do not infer speaker count, dialogue density, or subtitle timing without evidence.

### 3. Identify Localization Risks

Record:

- source language and likely target-language needs,
- visible-mouth sections that may need lip sync or coverage,
- on-screen text, captions, lower thirds, charts, or UI that may need replacement,
- music or effects that should remain under dubbed audio,
- any sections unsuitable for automated video translation.

### 4. Handoff To IDEA And SCRIPT

Give downstream stages a grounded source inventory, transcript confidence notes, timing risks, and protected source elements so translation decisions do not drift away from the actual video.

## Quality Gate

- source video is reviewed before target-language planning,
- summaries cite probe data,
- visible speech and on-screen text risks are explicit,
- no target-language script or HeyGen video-translate job starts from an unreviewed source.
