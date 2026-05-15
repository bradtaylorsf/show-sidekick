---
name: "clip-factory-publish-director"
description: "Package multi-aspect clip deliverables with source-window metadata and handoff files."
applies_to: "pipelines/clip-factory"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Clip Factory Pipeline

## When To Use

Use this stage after all clip variants render and pass final review.

## Multi-Aspect Deliverables

Enumerate every deliverable by clip id, source window, target aspect, platform, runtime, caption file, and render path.

## Process

1. Group deliverables by clip id and platform.
2. Include rendered clips, caption files, source-window metadata, reframing notes, edit decisions, and NLE handoff files.
3. Surface caveats: crop compromises, caption uncertainty, weak audio, or context loss.
4. Keep source references visible so a human editor can trace each output to the original footage.
5. Record publish destinations and any platform-specific metadata.

## Quality Gate

- multi-aspect deliverables are complete,
- source windows are attached to each clip,
- caveats are visible,
- the package is ready for a human editor or platform upload.
