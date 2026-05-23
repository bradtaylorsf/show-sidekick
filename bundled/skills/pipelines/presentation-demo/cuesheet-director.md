---
name: "presentation-demo-cuesheet-director"
description: "Generate approved narration timing and slide-aware cuesheet anchors."
applies_to: "pipelines/presentation-demo"
stage: "cuesheet"
produces: "cuesheet"
---
# Cuesheet Director - Presentation Demo Pipeline

## Goal

Produce a voiceover `cuesheet` after the script checkpoint is approved.

## Approval Gate

Call the registry-selected TTS provider only after the script checkpoint is `approved`. Human approval is required before any TTS or paid generation.

## Process

1. Confirm the approved script includes slide references.
2. Select narration through existing registry behavior, using `tts_selector` or the configured provider profile.
3. Record provider, voice ID/name, cost, and rejected alternatives in decision and cost artifacts.
4. Transcribe or timestamp the generated narration with `whisper` or equivalent.
5. Produce `cuesheet.json` with `master_clock: voiceover` and scene anchors carrying slide IDs.

## Output Contract

The cuesheet must align narration, sections, words, captions, scene anchors, and slide IDs for scene planning and edit decisions.
