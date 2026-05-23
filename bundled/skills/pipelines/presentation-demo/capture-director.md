---
name: "presentation-demo-capture-director"
description: "Normalize the deck source and produce the canonical deck_manifest."
applies_to: "pipelines/presentation-demo"
stage: "capture"
produces: "deck_manifest"
---
# Capture Director - Presentation Demo

## Goal

Produce `deck_manifest.json` as the canonical deck artifact. Do not substitute `capture_manifest`; use `capture_manifest` only as a downstream compatibility bridge when a tool needs screenshot-style `story_id` references.

## Deck Manifest Contract

Each manifest records source provenance, file type, source path or URL, project-local working file, sha256, byte size, slide IDs, slide order, slide screenshots, dimensions, extracted text, speaker notes when available, and warnings.

## Workflow

1. Validate the approved deck source before any paid provider or render call.
2. Normalize source files into the project workspace.
3. Extract or prepare stable per-slide IDs.
4. Record text and notes provenance as `native`, `ocr`, `pptx_notes`, `operator`, or `absent`.
5. Save a schema-valid `deck_manifest` for downstream script and scene work.

## Quality Gate

- `deck_manifest` matches `schemas/artifacts/deck_manifest.schema.json`.
- Every slide has stable `id`, `order`, and image metadata.
- Unsupported or authenticated URLs fail clearly.
