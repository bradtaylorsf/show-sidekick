---
name: "presentation-demo-asset-director"
description: "Generate narration, captions, diagrams, and support assets after approval gates."
applies_to: "pipelines/presentation-demo"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Presentation Demo Pipeline

## Goal

Produce an `asset_manifest` for approved narration, slide images, captions, callouts, diagrams, and support visuals.

## Approval Gate

Do not call the registry-selected TTS provider or paid generation unless the script checkpoint is approved and the relevant provider announcement/approval path has run.

## Process

1. Read approved `script`, `scene_plan`, `deck_manifest`, and `cuesheet`.
2. Reuse deck slide images as primary source assets.
3. Generate or prepare only support visuals that the approved scene plan requires.
4. Record provider, prompt, seed, voice ID/name, dimensions, cost, and approval state in metadata.
5. Keep every asset linked to a scene ID, script section, or slide ID.

## Output Contract

Produce a schema-valid `asset_manifest` with paths, provenance, provider decisions, costs, and known limitations.
