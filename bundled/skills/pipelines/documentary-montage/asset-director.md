---
name: "documentary-montage-asset-director"
description: "Select retrieval-backed documentary montage assets with MMR diversification and attribution."
applies_to: "pipelines/documentary-montage"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Documentary Montage Pipeline

## When To Use

Use this stage after `scene_plan` and `end_tag_plan` are approved. The asset job is to retrieve, select, attribute, and package real clips and stills.

## Retrieval-first rule

Use retrieval; generation requires logged `fallback_decision` or `capability_extension`. Do not call image or video generation for a missing archive beat until retrieval has failed the corpus quality bar and the decision is logged.

## MMR diversification

For each scene slot, start from the scene seed and candidate pool, then apply:

score(c) = (1 - λ) × sim(c, seed) - λ × max(sim(c, picked))

Default to λ = 0.3 and pool 30. Select a mix that preserves relevance, era, source credibility, visual variety, and rights clarity.

## Corpus quality bar

The asset manifest must preserve evidence that scene planning met:

corpus size >= 8 * scene_plan.slots.length AND median(top_n_scores) >= 0.22

If the final asset search cannot meet that bar, return a critical send-back: Grow the corpus with new queries.

## Process

1. Query `stock_cross_search` across stock video and image providers for each approved seed.
2. Use `clip_search` and `clip_embedder` when a local corpus exists.
3. For every selected asset, record source, URL or local path, license, attribution, retrieval query, score, scene reference, and rejection rationale for close alternatives.
4. Include the `end_tag_plan` support assets: source card, logo, final text layer, or concat card.
5. If fallback generation is approved, link the exact `fallback_decision` or `capability_extension` id from the decision log.

## Quality Gate

- every selected asset maps to a retrieval result or logged fallback,
- rights and attribution are explicit,
- MMR-diversified picks do not repeat the same visual texture without reason,
- no generated clip is present without `fallback_decision` or `capability_extension`,
- the end tag assets are ready for edit and compose.
