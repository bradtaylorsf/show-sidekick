---
name: "hybrid-scene-director"
description: "Plan source/support scene treatments, overlays, and variant safety."
applies_to: "pipelines/hybrid"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Hybrid Pipeline

## When To Use

You are translating the hybrid structure into a visual system that keeps the source visible and the support layers under control.

## Prerequisites

| Layer | Resource | Purpose |
|-------|----------|---------|
| Schema | `schemas/artifacts/scene_plan.schema.json` | Artifact validation |
| Prior artifacts | `priorArtifacts.script`, `priorArtifacts.idea`, `priorArtifacts.source_review` | Hybrid structure and source truth |
| Tools | `frame_sampler`, `scene_detect` | Optional source inspection |
| Playbook | Active style playbook | Layout consistency |

## Process

### 0. Source vs Generated Decisioning

Every scene must declare `source_role`, `generated_support_role`, and `handoff`.

- `source_role`: what captured material proves or carries in the scene.
- `generated_support_role`: what generated support visuals clarify, label, diagram, summarize, or fill.
- `handoff`: the exact edit beat where attention moves between captured material and generated support visuals.

Captured material is the factual anchor. Do not use generated inserts to replace source evidence, imply source coverage that does not exist, or hide uncertainty from `source_media_review`.

### 1. Keep The Anchor Medium Visible

If the piece is source-led, the source must remain visually primary in the scene plan. Do not hide the anchor behind constant overlays.

### 2. Reserve Support For Clear Jobs

Use support scenes for:

- chapter transitions,
- clarifying diagrams,
- stat emphasis,
- CTA or summary moments,
- gap-filling inserts.

### 3. Plan Variant Safety

If the project needs multiple aspect ratios, define where:

- subtitles live,
- speaker labels live,
- chart or code safe zones live,
- crop-sensitive source media becomes unsafe.

### 4. Use Metadata For Balance Rules

Recommended metadata keys:

- `anchor_rules`
- `support_rules`
- `safe_zones`
- `variant_rules`
- `overlay_density_limits`

### 5. Quality Gate

- the anchor medium stays primary where intended,
- source-vs-generated decisioning is explicit for every scene,
- the handoff between captured material and generated support visuals is clear,
- support layers are limited and purposeful,
- aspect-ratio planning is explicit,
- no scene relies on invisible future magic.

## Common Pitfalls

- Turning source-led scenes into overlay soup.
- Forgetting variant-safe zones until compose.
- Using generated inserts for every transition.
