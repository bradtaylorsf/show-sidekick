---
name: "presentation-demo-cuesheet-director"
description: "Turn the approved voiceover into the master-clock cuesheet."
applies_to: "pipelines/presentation-demo"
stage: "cuesheet"
produces: "cuesheet"
---
# Cuesheet Director - Presentation Demo

## Goal

Build a schema-valid `cuesheet.json` where `master_clock` is `voiceover`.

## Workflow

1. Confirm script approval before selecting a TTS provider.
2. Record voice selection and provider choice in `decision_log`.
3. Generate or attach narration through registry-backed TTS.
4. Build segments, words when available, sections, and scene anchors.
5. Carry `slide_ids` into scene anchors when voiceover timing maps to deck material.

## Quality Gate

- The artifact matches `schemas/artifacts/cuesheet.schema.json`.
- `master_clock` is `voiceover`.
- Timing covers every approved script section.
