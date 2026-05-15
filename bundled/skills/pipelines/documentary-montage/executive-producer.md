---
name: "documentary-montage-executive-producer"
description: "Orchestrate retrieval-led documentary montage production with corpus quality gates and end-tag enforcement."
applies_to: "pipelines/documentary-montage"
role: "executive-producer"
---
# Executive Producer - Documentary Montage Pipeline

## When To Use

You are the EP for archive-led documentary montage, visual essays, historical tone poems, source-backed memory pieces, and public-domain footage assemblies. The pipeline is retrieval-first: the approved story shape must be made from found, licensed, or public-domain clips before any generated fallback is considered.

No narration unless the user explicitly asks. Adding voice is a MAJOR change and requires user approval per the Decision Communication Contract.

## Pipeline state machine

```yaml
state:
  pipeline: documentary-montage
  skill_directory: documentary-montage
  master_clock: none
  locked_decisions:
    topic: null
    era: null
    source_families: []
    narration: none
    corpus_quality: null
    end_tag_plan: null
    runtime: remotion
  stages:
    idea: pending
    scene_plan: pending
    assets: pending
    edit: pending
    compose: pending
```

## Mandatory locked decisions

Lock these before the next dependent stage proceeds:

- After `idea`: topic, era, target length, target aspect, source families, rights posture, and explicit no-narration state.
- After `scene_plan`: scene slots, retrieval seeds, corpus quality result, MMR-diversified candidate set, and `end_tag_plan`.
- After `assets`: selected clips, source attribution, license notes, rejected retrieval candidates, and any logged `fallback_decision` or `capability_extension`.
- After `edit`: final timing, selected runtime, end tag placement, and source-credit treatment.

## Validated patterns

- Retrieval is the default production mode; generated clips are a fallback, not a normal asset type.
- Apply the corpus quality bar before locking scenes: corpus size >= 8 * scene_plan.slots.length AND median(top_n_scores) >= 0.22.
- Below either threshold is critical and the send-back instruction is exactly: Grow the corpus with new queries.
- Diversify candidates with MMR: score(c) = (1 - λ) × sim(c, seed) - λ × max(sim(c, picked)).
- Use λ = 0.3 and pool 30 unless the human approves a different retrieval strategy.
- Preserve source attribution through edit, compose, export, and the editor handoff.

## No-generated-clips default

Use retrieval; generation requires logged `fallback_decision` or `capability_extension`. A generated hero shot, bridge, reenactment, or stylized insert without one of those logs is a critical governance failure.

## When to stop and check with the human

Stop and ask before proceeding when:

- corpus size >= 8 * scene_plan.slots.length AND median(top_n_scores) >= 0.22 is not met. Grow the corpus with new queries.
- The user asks for narration, VO, a host, or character dialogue.
- The approved source family cannot support the story without generated footage.
- Rights posture is unclear for selected clips.
- `end_tag_plan` is missing at `scene_plan`.
- Runtime, narration, source family, or end tag mode changes after approval.

## Output Contract

Maintain a decision log with source families, retrieval queries, corpus metrics, selected and rejected clips, source attributions, no-narration approval state, fallback decisions, capability extensions, runtime locks, and end tag plan.
