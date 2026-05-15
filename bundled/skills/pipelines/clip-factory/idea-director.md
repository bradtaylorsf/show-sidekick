---
name: "clip-factory-idea-director"
description: "Perform input-media analysis and select the clip strategy."
applies_to: "pipelines/clip-factory"
stage: "idea"
produces: "brief"
---
# Idea Director - Clip Factory Pipeline

## When To Use

Use this stage after source review. Do not pick clip ideas until the actual footage has been analyzed.

## Input-Media Analysis

Input-media analysis precedes idea selection

Before selecting a clip strategy, summarize:

- source length,
- source framing and orientation,
- speaker/action visibility,
- content density and dead zones,
- strongest transcript moments or visual beats,
- platform/aspect risks,
- number of viable clips the source can support.

## Process

1. Read `source_media_review` and scene_detect candidate windows.
2. Choose clip count and target aspects from source strength, not a preset quota.
3. Select a clip strategy: hook moments, chapter cutdowns, quote cards, product beats, before/after, event highlights, or educational snippets.
4. Record rejected strategies and why the footage cannot support them.
5. Pass source constraints and candidate windows to scene planning.

## Quality Gate

- Input-media analysis precedes idea selection,
- clip count is feasible,
- target aspects are explicit,
- selected strategy maps to real source windows.
