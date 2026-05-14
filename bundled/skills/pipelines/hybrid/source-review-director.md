---
name: "hybrid-source-review-director"
description: "Inspect supplied source media before hybrid planning begins."
applies_to: "pipelines/hybrid"
stage: "source_review"
produces: "source_media_review"
---
# Source Review Director - Hybrid Pipeline

## When To Use

Run this first when the episode includes supplied footage, screen recordings, audio, stills, or product clips. The goal is to create a grounded source inventory before idea and script decisions depend on the media.

## Process

### 1. Review Supplied Media

Use the registry tool `source_media_review` for each supplied file. Add frame sampling, transcription, or scene detection only when it clarifies the source.

### 2. Ground The Summary

Each content summary must cite technical probe fields such as duration_seconds, resolution, codec, or audio stream details.

### 3. Identify Reusable Moments

Mark the source moments that can carry story beats directly, plus any gaps that need generated support visuals later.

### 4. Handoff To IDEA And SCRIPT

Record anchor media, constraints, standout moments, unusable sections, and risks so downstream directors do not invent source facts.

## Quality Gate

- every supplied file is reviewed or explicitly marked out of scope,
- summaries are grounded in probe data,
- source constraints are ready for source-vs-generated decisioning,
- no generated support need is proposed before the source evidence is understood.
