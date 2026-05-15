---
name: "talking-head-edit-director"
description: "Build edit decisions for presenter-led footage with strict caption sync."
applies_to: "pipelines/talking-head"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Talking Head Pipeline

## When To Use

Use this stage after captions, support assets, and cleanup choices are ready. Build the edit instructions that keep the speaker clear and captions aligned.

## Subtitle Sync

subtitle sync tolerance ±0.3s

Talking-head subtitle sync is tighter than explainer's ±0.5s because the viewer can see the speaker's mouth. If captions drift beyond ±0.3s, revise timing before compose.

## Runtime Lock

Read the selected runtime from prior artifacts and preserve it in `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Cut for clarity while preserving speaker meaning.
2. Keep caption cues aligned to transcript word timings.
3. Place support visuals around presenter emphasis rather than covering the face.
4. Mark sections that need audio cleanup or visual reframing.
5. Keep variant timing consistent across aspect ratios.

## Quality Gate

- subtitle sync tolerance ±0.3s is met,
- transcript confidence threshold 0.8 was enforced,
- runtime is unchanged,
- presenter remains visually primary.
