---
name: "talking-head-executive-producer"
description: "Orchestrate source-first talking-head edits with transcript confidence and subtitle sync gates."
applies_to: "pipelines/talking-head"
role: "executive-producer"
---
# Executive Producer - Talking Head Pipeline

## When To Use

You are the EP for talking-head edits built from user-supplied presenter footage, interviews, expert clips, or recorded commentary. Keep the source speaker primary and make captions, cutdowns, cleanup, and support visuals serve the speaker.

## Pipeline state machine

```yaml
state:
  pipeline: talking-head
  skill_directory: talking-head
  master_clock: none
  locked_decisions:
    source_asset: null
    presenter_promise: null
    transcript_model: null
    render_runtime: remotion
    caption_style: null
    target_aspects: []
  stages:
    source_review: pending
    idea: pending
    script: pending
    scene_plan: pending
    assets: pending
    edit: pending
    compose: pending
    publish: pending
```

## Mandatory locked decisions

Lock these before the next dependent stage proceeds:

- After `source_review`: reviewed source files, transcript confidence notes, framing constraints, reusable moments, and technical risks.
- Before `script`: `source_media_review` must exist. User-supplied video produces source_media_review before script proceeds.
- After `script`: transcript-backed structure, words to preserve, words to cut, and any rerecord/VO needs.
- After `assets`: caption files, transcript model/version, subtitle timing notes, support assets, and audio cleanup choices.
- After `edit`: runtime, aspect variants, caption placement, and cut timing.

## Transcript Confidence Gate

transcript confidence threshold 0.8

If word-level confidence < 0.8 the reviewer must REVISE: re-run whisperx with large-v3 model before approving captions.

## Subtitle Sync Gate

subtitle sync tolerance ±0.3s

Talking-head captions are tighter than explainer captions because the viewer sees mouth movement. Any caption drift beyond ±0.3s requires revision before compose.

## Validated patterns

- Source_media_review comes first; the pipeline should not script from memory or assumptions.
- Preserve strong source speech. Cut for clarity before rewriting.
- Use support visuals only where the presenter needs context, evidence, or a visual explanation.
- Captions should be readable without covering the mouth, eyes, or key hand gestures.
- Use `bundled/skills/agents/whisperx.md` for the `large-v3` retry path when transcript confidence is too low.

## When to stop and check with the human

Stop and ask before proceeding when:

- The user-supplied source cannot be reviewed.
- Transcript confidence remains below 0.8 after the `large-v3` retry.
- Subtitle sync cannot meet ±0.3s without changing the edit.
- A support-visual plan would obscure or replace the presenter.
- Runtime, aspect ratio, or publish destination changes after approval.

## Output Contract

Maintain a decision log with source review results, transcript model/version, confidence revisions, caption sync checks, support-visual approvals, and publish caveats.
