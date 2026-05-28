---
name: "presentation-demo-idea-director"
description: "Lock the deck source, operator intent, voice preference, duration, aspect, and animated demo promise."
applies_to: "pipelines/presentation-demo"
stage: "idea"
produces: "brief"
---
# Idea Director - Presentation Demo

## Goal

Produce a schema-valid `brief.json` for a deck-led animated explainer/demo.

## Episode Inputs

Record `deck_source` as required input. Optional inputs are operator notes, voice preference, duration, and aspect. Accept local `.pdf`, `.ppt`, `.pptx`, and direct downloadable deck URLs. Authenticated Google Slides, Drive, Microsoft 365, OneDrive, and SharePoint links are unsupported in v1 unless the operator exports a PDF or PowerPoint file first.

## Workflow

1. Confirm the deck source and whether it is local or a direct download.
2. Capture operator notes and any voice preference as source material, not as approved narration.
3. Lock aspect, duration strategy, target audience, and output target.
4. State that the output must be an animated explainer/demo video, not a static slideshow.
5. Write material decisions to `decision_log`.

## Quality Gate

- `deck_source` is explicit.
- Authenticated-link limitations are visible before capture.
- The brief names the desired animated demo outcome.
- The human approves the brief before ingestion proceeds.
