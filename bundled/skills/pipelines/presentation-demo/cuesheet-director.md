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
2. Human approval of the script is required before any TTS call.
3. Select narration through the registry `tts_selector` capability only; do not execute a provider directly or shell around the registry.
4. Support the configured ElevenLabs, OpenAI, Google, or local TTS lane when available, and record rejected alternatives.
5. Record provider choice, voice ID/name, model, and estimated/actual cost in `decision_log` and `cost_log`.
6. Generate or attach narration through registry-backed TTS.
7. Build segments, words when available, sections, and scene anchors.
8. Carry `slide_ids` into scene anchors when voiceover timing maps to deck material.

## Quality Gate

- The artifact matches `schemas/artifacts/cuesheet.schema.json`.
- `master_clock` is `voiceover`.
- Timing covers every approved script section.
