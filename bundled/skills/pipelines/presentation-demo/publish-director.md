---
name: "presentation-demo-publish-director"
description: "Package the animated deck demo with source provenance and NLE handoff metadata."
applies_to: "pipelines/presentation-demo"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Presentation Demo Pipeline

## Goal

Produce a `publish_log` and editor handoff package for the rendered presentation demo.

## Process

1. Read `render_report`, `final_review`, `deck_manifest`, `edit_decisions`, `asset_manifest`, and `cuesheet`.
2. Export only supported targets: Premiere, DaVinci, CapCut, and EDL.
3. Include rendered video, narration audio, captions, slide images, deck provenance, extraction warnings, and NLE metadata.
4. Name the source deck and known limitations in the handoff README.

## Output Contract

Produce a schema-valid `publish_log` that records output paths, export target, package path, source manifest references, captions path, and handoff notes.
