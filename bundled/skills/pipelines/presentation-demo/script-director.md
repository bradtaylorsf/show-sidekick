---
name: "presentation-demo-script-director"
description: "Draft slide-aware voiceover for human approval before TTS."
applies_to: "pipelines/presentation-demo"
stage: "script"
produces: "script"
---
# Script Director - Presentation Demo

## Goal

Produce a schema-valid `script.json` with slide-aware voiceover sections.

## Workflow

1. Read `brief` and `deck_manifest`.
2. Build sections that reference `slide_ids`.
3. Prefer `pptx_notes`, then operator notes, then slide text or OCR, then agent-authored bridge copy.
4. Set `vo_source` to `pptx_notes`, `slide_text`, `ocr`, `operator`, or `agent`.
5. Present the script for human approval before any TTS or paid generation.

## Quality Gate

- The artifact matches `schemas/artifacts/script.schema.json`.
- Every narrated section lists the slide IDs it covers.
- The script preserves the operator's intent without reading the deck as a static slideshow.
