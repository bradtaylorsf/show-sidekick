---
name: "daily-news-publish-director"
description: "Package the rendered news episode, sources, screenshots, and captions for delivery."
applies_to: "pipelines/daily-news"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Daily News Pipeline

## When To Use

Package the finished news roundup after compose has rendered and self-reviewed the episode. Daily-news delivery must preserve provenance: the viewer-facing video, source URLs, real screenshots, captions, and caveats should stay together.

## Prerequisites

| Layer | Resource | Purpose |
|-------|----------|---------|
| Schema | `schemas/artifacts/publish_log.schema.json` | Artifact validation |
| Prior artifacts | `priorArtifacts.compose`, `priorArtifacts.capture`, `priorArtifacts.research`, `priorArtifacts.script` | Rendered output, source evidence, and narration context |
| Playbook | Active news-broadcast playbook | Metadata and naming consistency |

## Process

### 1. Package The Episode

Create a delivery folder containing the rendered episode, thumbnail or poster frame, optional caption files, and a source manifest.

### 2. Preserve Source Provenance

Include each selected story's publisher, headline, URL, publish date, captured screenshot path, and capture-quality flags. Do not strip paywall, cookie-banner, or geo-block notes; those notes explain visible artifacts.

### 3. Label Recurring Outputs

Use ISO episode dates and platform labels in filenames so scheduled runs do not collide:

- `daily-news-YYYY-MM-DD-vertical.mp4`
- `daily-news-YYYY-MM-DD-sources.yaml`
- `daily-news-YYYY-MM-DD-captions.srt`

### 4. Quality Gate

- rendered video exists,
- source manifest includes every selected story,
- screenshots and captions are referenced by relative paths,
- capture caveats remain visible in review notes,
- the package is ready for upload or handoff without manual cleanup.

## Common Pitfalls

- Publishing the video without the source manifest.
- Losing capture caveats that explain visible paywalls or cookie banners.
- Reusing yesterday's date or filename in a scheduled run.
