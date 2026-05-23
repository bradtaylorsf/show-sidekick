---
name: "presentation-demo-capture-director"
description: "Ingest decks and extract slide screenshots, text, notes, and provenance."
applies_to: "pipelines/presentation-demo"
stage: "capture"
produces: "deck_manifest"
---
# Capture Director - Presentation Demo Pipeline

## Goal

Produce `deck_manifest` as the canonical slide contract and `capture_manifest` as screenshot compatibility output.

## Capture Tools

Call `deck_ingest` first. It normalizes local PDFs, PPT/PPTX files, and direct downloadable deck URLs into project-local working files and records source provenance. Then call `deck_extract` to produce slide IDs, image paths, dimensions, extracted text, speaker notes, and warnings.

## Process

1. Read the approved brief and source deck input.
2. Run `deck_ingest` with an output directory inside the project root.
3. Reject unsupported extensions or authenticated/non-downloadable URLs before any paid provider or rendering call.
4. Run `deck_extract` on the ingestion output.
5. Verify every slide has a stable `slide_0001`-style ID, original order, image path, dimensions, and provenance.
6. Preserve PowerPoint speaker notes when present and attach them to the correct slide ID.
7. Write both `deck_manifest.json` and `capture_manifest.json`; `capture_manifest.screenshots[].story_id` must equal the slide ID.

## Quality Gate

- `deck_manifest` validates against `schemas/artifacts/deck_manifest.schema.json`.
- `capture_manifest` validates against `schemas/artifacts/capture_manifest.schema.json`.
- Extraction warnings are explicit and do not block script unless slide identity or images are missing.
