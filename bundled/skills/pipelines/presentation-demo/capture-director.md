---
description: "Ingest deck sources and produce a stable deck_manifest."
stage: capture
produces: deck_manifest
---

# Presentation Demo Capture Director

## Deck Manifest Contract

Create `deck_manifest.json` with source provenance, stable slide IDs, slide indexes, screenshot paths, readable dimensions, slide text, and speaker notes when available. PDF inputs may use slide text or OCR fallback plus operator notes.

## Screenshot Rules

Each slide screenshot must be deterministic, stored as a project artifact, and linked by `deck_manifest.slides[].screenshot_path`. Keep slide IDs stable across rebuilds for the same deck order so script, scene plan, edit decisions, and export package can reference them.

## Source Provenance

Record local file paths or downloadable URL metadata. Do not store credentials. If a URL requires authentication or interactive browser access, stop and ask for a local deck file or direct download.
