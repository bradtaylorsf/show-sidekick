---
name: "presentation-demo-asset-director"
description: "Prepare slide screenshots, captions, callouts, and support visuals for the deck demo."
applies_to: "pipelines/presentation-demo"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Presentation Demo

## Goal

Produce `asset_manifest.json` for slide screenshots, narration-linked captions, callouts, and support visuals.

## Workflow

1. Treat slide screenshots from `deck_manifest` as source assets.
2. Add support visuals only when the scene plan calls for clarification.
3. Reuse the approved cuesheet narration audio and timing; do not make a second TTS call in assets.
4. Keep all assets traceable to `slide_ids`, VO sections, or explicit support-visual rationales.
5. Preserve editable source paths for the export handoff.

## Quality Gate

- The artifact matches `schemas/artifacts/asset_manifest.schema.json`.
- No asset silently replaces a source slide claim.
- Caption and callout assets match approved VO timing.
