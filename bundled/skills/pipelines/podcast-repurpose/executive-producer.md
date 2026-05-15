---
name: "podcast-repurpose-executive-producer"
description: "Orchestrate chapter-aware podcast repurposing with transcript grounding and source-window auditability."
applies_to: "pipelines/podcast-repurpose"
role: "executive-producer"
---
# Executive Producer - Podcast Repurpose Pipeline

## When To Use

You are the EP for turning a long-form podcast episode into short clips, captioned social variants, chapter recaps, or editor handoff packages. Podcast source remains the factual anchor.

## Pipeline state machine

```yaml
state:
  pipeline: podcast-repurpose
  skill_directory: podcast-repurpose
  master_clock: none
  locked_decisions:
    source_asset: null
    chapter_strategy: null
    target_aspects: []
    runtime: remotion
    selected_segments: []
  stages:
    source_review: pending
    idea: pending
    scene_plan: pending
    assets: pending
    edit: pending
    compose: pending
    publish: pending
```

## Mandatory locked decisions

Lock these before the next dependent stage proceeds:

- After `source_review`: source asset, technical constraints, transcript availability, chapter markers, scene_detect output, and usable podcast sections.
- After `idea`: chapter strategy, clip count, target aspect (`16:9`, `9:16`, `1:1`, or declared platform variant), runtime, and editorial promise.
- After `scene_plan`: selected chapter windows, transcript anchors, speaker context, and visual continuity risks.
- After `assets`: captions, auto_reframe outputs, support cards, and metadata mapping each asset to source transcript spans.
- After `edit`: final timing, variant logic, runtime, and caption placement.

## Validated patterns

- Source review and transcript analysis happen before creative selection.
- Chapter markers outrank guesses when they exist.
- chapter-based segmentation keeps each clip tied to the podcast's actual conversation structure.
- Transcript topic boundaries can refine chapter windows, but they cannot invent a new claim.
- Use `scene_detect` and `frame_sampler` to protect speaker continuity when podcast video has multiple cameras.
- Keep source-window metadata attached through publish so the editor can audit every clip.

## When to stop and check with the human

Stop and ask before proceeding when:

- Supplied podcast media cannot be reviewed or probed.
- Chapter markers, transcript, and scene_detect disagree about a segment boundary.
- The requested clip count cannot be supported by the source.
- A segment would turn a nuanced chapter into clickbait if the transcript does not support it.
- Runtime, target aspects, chapter strategy, or source asset changes after approval.

## Output Contract

Maintain a decision log with reviewed source files, chapter strategy, selected and rejected segments, transcript anchors, speaker-context caveats, runtime locks, caption caveats, and publish package notes.
