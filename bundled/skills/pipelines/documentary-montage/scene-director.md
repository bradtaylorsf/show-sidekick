---
name: "documentary-montage-scene-director"
description: "Build a retrieval-backed scene plan and required end_tag_plan for documentary montage."
applies_to: "pipelines/documentary-montage"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Documentary Montage Pipeline

## When To Use

Use this stage after the brief locks the topic, source families, target length, and no-narration state. There is no script stage: scene slots come from the documentary arc and retrieval evidence.

## Corpus quality bar

Before approving the scene plan, verify this exact rule:

corpus size >= 8 * scene_plan.slots.length AND median(top_n_scores) >= 0.22

If corpus size is too small or median(top_n_scores) is below 0.22, return a critical reviewer finding with this exact proposed fix: Grow the corpus with new queries.

## MMR diversification

Diversify each slot's candidates with:

score(c) = (1 - λ) × sim(c, seed) - λ × max(sim(c, picked))

Default to λ = 0.3 and pool 30. Use the top diversified picks only after each slot has enough candidates to preserve both relevance and visual variety.

## Required end_tag_plan

Produce `end_tag_plan` alongside `scene_plan`. The end tag plan is required at this stage; a missing `end_tag_plan` artifact is critical. Use `bundled/schemas/artifacts/end_tag_plan.schema.json`.

The `end_tag_plan` must include:

- `mode`: `overlay` or `concat`
- `text`: the final tag, source credit cue, or series identity
- `placement_seconds_from_end`: when the tag begins relative to the end
- `style_ref`: the approved playbook, brand card, or source-credit treatment

## No-generated-clips default

Use retrieval; generation requires logged `fallback_decision` or `capability_extension`. If a scene cannot be supported by retrieval, mark it as a send-back candidate before proposing generation.

No narration unless the user explicitly asks. Adding voice is a MAJOR change and requires user approval per the Decision Communication Contract.

## Process

1. Convert the brief into scene slots with narrative purpose, target duration, source family, seed query, and visual contrast.
2. Run or plan `stock_cross_search` and `clip_search` for each seed. Record top_n_scores for the corpus quality check.
3. Apply MMR diversification per slot using λ = 0.3 and pool 30.
4. Build a schema-valid `scene_plan` with shot language, source notes, and required assets.
5. Build the required `end_tag_plan` and include it in the checkpoint.

## Quality Gate

- corpus size >= 8 * scene_plan.slots.length AND median(top_n_scores) >= 0.22,
- weak corpus sends back with Grow the corpus with new queries.,
- `end_tag_plan` exists and validates,
- every planned scene has retrieval seeds and source intent,
- generated clips are absent unless a fallback has already been logged.
