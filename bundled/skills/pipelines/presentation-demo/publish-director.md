---
name: "presentation-demo-publish-director"
description: "Package the animated deck demo for review and NLE handoff."
applies_to: "pipelines/presentation-demo"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Presentation Demo

## Goal

Produce `publish_log.json` for the rendered rough cut and editor handoff package.

## Workflow

1. Package the rendered video, `deck_manifest`, slide screenshots, narration, captions, assets, edit decisions, render report, and NLE timeline files.
2. Include notes for unsupported authenticated links, OCR gaps, missing speaker notes, and deck extraction warnings.
3. Export only to targets declared by the manifest: Premiere, DaVinci, CapCut, and EDL.

## Quality Gate

- The artifact matches `schemas/artifacts/publish_log.schema.json`.
- The package contains enough deck provenance for an editor to audit the rough cut.
- Review notes do not imply the output is a static slideshow.
