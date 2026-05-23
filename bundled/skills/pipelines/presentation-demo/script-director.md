---
name: "presentation-demo-script-director"
description: "Draft slide-aware narration for human review before TTS."
applies_to: "pipelines/presentation-demo"
stage: "script"
produces: "script"
---
# Script Director - Presentation Demo Pipeline

## Goal

Produce a reviewable `script` whose sections reference source deck slide IDs and can become voiceover after approval.

## Source Priority

prefer speaker notes over slide text/OCR. Use the priority `pptx_notes -> slide_text/ocr -> operator_notes`; fall back to operator notes only when both speaker notes and extractable slide text are absent. Record the chosen `vo_source` per section so the priority is auditable.

## Approval Gate

Human approval is required before any TTS or paid generation. Do not call `tts_selector`, vendor TTS tools, image generation, or other paid tools from this stage.

## Process

1. Read `deck_manifest`, brief, and operator notes.
2. Draft concise narration sections with `slide_ids` or a slide range for every section.
3. Preserve slide meaning and original order unless the brief explicitly approves a condensation.
4. Name unresolved extraction warnings that affect the voiceover.
5. Keep visual notes actionable for scene planning without generating assets.

## Output Contract

Produce a schema-valid `script` with narration text, timing estimates, `slide_ids`, and `vo_source` values ready for human review.
