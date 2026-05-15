---
name: "podcast-repurpose-asset-director"
description: "Prepare podcast clip assets, captions, reframes, and minimal support cards."
applies_to: "pipelines/podcast-repurpose"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Podcast Repurpose Pipeline

## When To Use

Use this stage after the scene plan is approved. Prepare source clip windows, caption assets, reframed variants, and only the support assets the podcast plan requires.

## Transcript-Linked Assets

Captions and support cards must map back to transcript spans. The transcript is the proof surface for every quote, topic label, and chapter title.

## Process

1. Create asset entries for each selected source segment with start/end, source file, chapter id, transcript span, clip id, target aspect, and selection rationale.
2. Generate captions from transcript windows when speech is present.
3. Run or plan `auto_reframe` for each target aspect where host or guest framing is at risk.
4. Use `video_selector` only for approved support inserts such as title cards, context cards, or simple platform intros.
5. Store source-window metadata so edit, compose, and publish can audit every clip.

## Quality Gate

- every asset maps to a reviewed podcast segment,
- captions map to transcript spans,
- auto_reframe decisions are recorded for platform variants,
- support assets do not replace the podcast source.
