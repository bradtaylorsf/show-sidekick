---
name: "clip-factory-executive-producer"
description: "Orchestrate footage-led clip production with source windows, aspect variants, and publish packaging."
applies_to: "pipelines/clip-factory"
role: "executive-producer"
---
# Executive Producer - Clip Factory Pipeline

## When To Use

You are the EP for turning supplied footage into multiple short clips for social, YouTube Shorts, Reels, TikTok, ads, or internal recap variants. Keep the source footage as the factual anchor and make every output traceable to source windows.

## Pipeline state machine

```yaml
state:
  pipeline: clip-factory
  skill_directory: clip-factory
  master_clock: none
  locked_decisions:
    source_asset: null
    clip_count: null
    target_aspects: []
    runtime: remotion
    selected_windows: []
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

- After `source_review`: source asset, technical constraints, transcript availability, scene_detect output, and usable content ranges.
- After `idea`: clip count, target aspect (`16:9`, `9:16`, `1:1`, or a declared platform variant), source asset, runtime, and clip strategy.
- After `scene_plan`: selected source windows, hook/hold/exit for each clip, and reframing risk.
- After `assets`: captions, auto_reframe outputs, support assets, and metadata mapping each asset to a source window.
- After `edit`: final timing, variant logic, and runtime.

## Validated patterns

- Source review and input-media analysis happen before creative clip selection.
- Each clip has one reason to exist: a hook, payoff, surprising line, demonstration, or transition.
- Clip windows come from scene_detect and transcript evidence; do not invent better moments.
- Use `auto_reframe` for aspect-ratio variants when subject focus would otherwise be lost.
- Keep source-window metadata attached through publish so the editor can audit every cut.

## When to stop and check with the human

Stop and ask before proceeding when:

- Supplied footage cannot be reviewed or probed.
- scene_detect output is missing or too noisy to support clip selection.
- The requested clip count cannot be supported by source quality.
- auto_reframe would crop out the speaker, product, or key action.
- Runtime, target aspects, or source asset changes after approval.

## Output Contract

Maintain a decision log with reviewed source files, selected clip windows, rejected windows, reframing decisions, caption caveats, runtime locks, and publish package notes.
