---
name: "presentation-demo-executive-producer"
description: "Coordinate the deck-to-animated-demo pipeline and enforce approvals before paid narration or rendering."
applies_to: "pipelines/presentation-demo"
---
# Executive Producer - Presentation Demo

## Pipeline State Machine

Run `idea -> capture -> script -> cuesheet -> scene_plan -> assets -> edit -> compose -> publish` exactly as the manifest declares. The deck is analyzed before the script so the voiceover can reference slide order, speaker notes, and operator notes.

## Mandatory Locked Decisions

- `deck_manifest` is the canonical deck artifact.
- Voiceover is the master clock after the script is approved.
- The deliverable is an animated explainer/demo video, not a static slideshow or slide export.
- Direct downloadable deck URLs are allowed; authenticated Google Slides, Drive, Microsoft 365, OneDrive, or SharePoint links are unsupported in v1 unless the user provides an exported file.

## Human Approval Gates

Require human approval at idea, script, and compose. The script approval gate happens before any TTS or paid narration call.

## When To Stop And Check With The Human

Stop when the deck source is authenticated, non-downloadable, unsupported, or ambiguous; when script revisions change the approved voiceover; or when the compose result falls back to static slide playback.
