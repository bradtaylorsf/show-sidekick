---
name: "talking-head-script-director"
description: "Build the talking-head script or cut script from reviewed source and confidence-checked transcript."
applies_to: "pipelines/talking-head"
stage: "script"
produces: "script"
---
# Script Director - Talking Head Pipeline

## When To Use

Use this stage after the brief and `source_media_review` are approved. The script can be a cut script, tightened transcript, pickup narration, or support-visual script, but it must preserve the reviewed source.

## Transcript Confidence Requirement

transcript confidence threshold 0.8

If word-level confidence < 0.8 the reviewer must REVISE: re-run whisperx with large-v3 model before approving captions.

Read `bundled/skills/agents/whisperx.md` before deciding whether to retry transcription with `large-v3`.

## Process

1. Confirm `source_media_review` is present before writing or approving the script.
2. Preserve strong source lines verbatim when they carry credibility.
3. Cut filler, false starts, and repeated setup while keeping meaning intact.
4. Mark caption-sensitive words, names, acronyms, and low-confidence spans.
5. Add support-visual copy only where the source needs context or evidence.

## Quality Gate

- source_media_review is used as the factual anchor,
- low-confidence transcript words are revised or flagged,
- speaker meaning is preserved,
- captions can be generated from confidence-checked words.
