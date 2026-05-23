---
name: "presentation-demo-edit-director"
description: "Build slide-aware edit decisions from voiceover timing and approved assets."
applies_to: "pipelines/presentation-demo"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Presentation Demo Pipeline

## Goal

Produce `edit_decisions` that align cuts, captions, callouts, and assets to the voiceover cuesheet.

## Governance

silent runtime swap is a CRITICAL governance violation. If the selected runtime cannot support the plan, escalate before changing it.

## Process

1. Read `scene_plan`, `asset_manifest`, `deck_manifest`, and `cuesheet`.
2. Map every cut to approved timing anchors and slide IDs.
3. Keep captions readable and avoid obscuring slide content.
4. Preserve the animated explainer/demo promise in edit timing.

## Output Contract

Produce schema-valid `edit_decisions` with complete timing coverage and no unexplained runtime substitution.
