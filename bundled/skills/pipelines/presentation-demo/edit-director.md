---
name: "presentation-demo-edit-director"
description: "Create VO-timed edit decisions for the animated deck demo."
applies_to: "pipelines/presentation-demo"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Presentation Demo

## Goal

Produce `edit_decisions.json` that turns the scene plan and assets into a coherent timed rough cut.

## Workflow

1. Use cuesheet sections and words as the timing source.
2. Keep cuts, overlays, and captions aligned to voiceover.
3. Preserve slide order unless the scene plan logs a deliberate reorder.
4. Flag any edit that would collapse the output into static slide playback.

## Quality Gate

- The artifact matches `schemas/artifacts/edit_decisions.schema.json`.
- Every approved VO section is covered.
- Runtime choice remains consistent with the motion-led promise.
