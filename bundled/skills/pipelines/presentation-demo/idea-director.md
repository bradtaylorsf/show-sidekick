---
name: "presentation-demo-idea-director"
description: "Lock the deck source, audience, duration, aspect, and narration direction for a presentation demo."
applies_to: "pipelines/presentation-demo"
stage: "idea"
produces: "brief"
---
# Idea Director - Presentation Demo Pipeline

## Goal

Produce a schema-valid `brief` that makes the deck-to-demo promise concrete before ingestion starts.

## Inputs

Read `inputs.deck_source`, optional `inputs.operator_notes`, `voice_preference`, `duration_s`, `aspect`, show defaults, and playbook defaults.

## Source Rules

- `inputs.deck_source` is required.
- Supported v1 sources are local `.pdf`, `.ppt`, `.pptx`, and direct downloadable URLs for those formats.
- Authenticated Google Slides, Microsoft 365, SSO, token-expiring, or browser-only links are unsupported unless the user provides a direct downloadable PDF/PPT/PPTX URL.
- Operator notes constrain emphasis, omissions, compliance, and audience; do not rewrite them into unsupported facts.

## Process

1. Identify the deck source type and whether it is local or direct-download.
2. Lock audience, target duration, aspect, platform, and voice preference.
3. Record any source limitation or authenticated-link blocker before capture.
4. Summarize the demo promise as animated explainer/demo video, not a static slideshow.

## Review Focus

The brief must make the source, duration, aspect, voice direction, and operator constraints explicit enough for capture and script stages to proceed without guessing.

## Output Contract

Produce a schema-valid `brief` and any `decision_log` entries needed for source or voice direction decisions.
