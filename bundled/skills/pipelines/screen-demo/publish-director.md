---
name: "screen-demo-publish-director"
description: "Package screen-demo deliverables with capture metadata, scene props, and handoff files."
applies_to: "pipelines/screen-demo"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Screen Demo Pipeline

## When To Use

Use this stage after the screen-demo render passes final review.

## Process

1. Group deliverables by product, demo step, aspect ratio, and platform.
2. Include rendered video, capture_manifest, terminal_scene props, caption files, edit decisions, render_report, and NLE handoff files.
3. Surface caveats: failed capture steps, private-data redactions, synthetic terminal assumptions, or text-readability compromises.
4. Include commands, URLs, app versions, and browser viewport details when they are needed for audit.
5. Record publish destinations and platform-specific metadata.

## Quality Gate

- deliverables are complete,
- capture mode and caveats are documented,
- source commands or capture steps remain auditable,
- the package is ready for a human editor or platform upload.
