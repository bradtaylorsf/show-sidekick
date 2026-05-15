---
name: "talking-head-asset-director"
description: "Prepare captions, transcript-linked support assets, cleanup audio, and optional generated inserts."
applies_to: "pipelines/talking-head"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Talking Head Pipeline

## When To Use

Use this stage after the scene plan is approved. Prepare captions, transcript metadata, cleanup audio, support graphics, and optional generated inserts.

## Transcript And Caption Gate

Read `bundled/skills/agents/whisperx.md` for the `large-v3` retry path. If word-level confidence is below transcript confidence threshold 0.8, rerun whisperx with `large-v3` before approving caption assets.

subtitle sync tolerance ±0.3s

## Process

1. Generate subtitle files from confidence-checked word timings using `subtitle_gen`.
2. Produce support assets only for approved support beats: diagrams, code snippets, lower thirds, or b-roll.
3. Use `audio_enhance` only to clarify speech; do not overprocess the presenter.
4. Keep asset metadata linked to source timecodes, transcript model/version, and confidence notes.
5. Store generated support prompts, seeds, provider, cost, and approval state.

## Quality Gate

- captions are generated from confidence-checked words,
- subtitle sync tolerance ±0.3s is met,
- support assets do not eclipse the presenter,
- every referenced file exists on disk.
