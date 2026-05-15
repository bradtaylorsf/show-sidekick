---
name: "podcast-repurpose-idea-director"
description: "Select a podcast clip strategy grounded in reviewed chapters and transcript evidence."
applies_to: "pipelines/podcast-repurpose"
stage: "idea"
produces: "brief"
---
# Idea Director - Podcast Repurpose Pipeline

## When To Use

Use this stage after source review. Do not pick clip ideas until the podcast episode, transcript, and chapter evidence have been analyzed.

## Podcast Strategy

Podcast source remains the factual anchor. Choose a strategy the episode can actually support:

- chapter recap,
- standout quote,
- guest insight,
- debate or contrast,
- tutorial excerpt,
- story beat,
- short platform teaser,
- full episode highlight reel.

## Process

1. Read `source_media_review`, transcript notes, chapter markers, and scene_detect candidate boundaries.
2. Choose clip count and target aspects from chapter strength, not a preset quota.
3. Record the chapter strategy and the editorial promise for each candidate clip.
4. Reject any clip angle that needs missing context or exaggerates the guest's claim.
5. Pass selected chapter anchors and source constraints to scene planning.

## Quality Gate

- chapter strategy is explicit,
- clip count is feasible,
- target aspects and runtime are locked,
- selected clips map to real podcast chapters, transcript spans, or reviewed topic boundaries.
