---
name: "talking-head-publish-director"
description: "Package talking-head deliverables, captions, transcript notes, and editor handoff files."
applies_to: "pipelines/talking-head"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Talking Head Pipeline

## When To Use

Use this stage after render and final review are complete. Package the output for the target platform and editor handoff.

## Process

1. Name deliverables by platform, aspect ratio, runtime, speaker, and version.
2. Include rendered video, caption files, transcript, source_media_review, support assets, audio notes, and NLE handoff files.
3. Mark any transcript confidence, caption sync, or source-quality caveats.
4. Keep generated support assets labeled as support rather than source evidence.
5. Record publish destinations and expected human review steps.

## Quality Gate

- every deliverable is clearly named,
- captions and transcript files are included,
- known source or transcript caveats are visible,
- the package is usable by an editor without re-inspecting the source.
