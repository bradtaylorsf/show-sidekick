---
name: "podcast-repurpose-publish-director"
description: "Package podcast clip deliverables with chapter, transcript, and source-window metadata."
applies_to: "pipelines/podcast-repurpose"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Podcast Repurpose Pipeline

## When To Use

Use this stage after all podcast clips render and pass final review.

## Chapter-Aware Deliverables

Enumerate every deliverable by podcast episode, chapter id, clip id, source window, transcript span, target aspect, platform, runtime, caption file, and render path.

## Process

1. Group deliverables by podcast episode, chapter, and platform.
2. Include rendered clips, caption files, transcript excerpts, chapter metadata, reframing notes, edit decisions, and NLE handoff files.
3. Surface caveats: context loss, caption uncertainty, weak audio, crop compromises, or speaker-identification ambiguity.
4. Keep source references visible so a human editor can trace each output to the original podcast.
5. Record publish destinations and any platform-specific metadata.

## Quality Gate

- chapter-aware deliverables are complete,
- source windows and transcript spans are attached to each clip,
- caveats are visible,
- the package is ready for a human editor or platform upload.
