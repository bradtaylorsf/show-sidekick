---
name: "clip-factory-edit-director"
description: "Build edit decisions for source-window clips and platform variants."
applies_to: "pipelines/clip-factory"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Clip Factory Pipeline

## When To Use

Use this stage after source-window assets, captions, and reframing plans exist. Build the edit instructions for each clip and variant.

## Runtime Lock

Preserve the approved runtime in `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Keep each cut inside the approved source window unless a revision explicitly changes the window.
2. Tighten dead air while preserving source meaning.
3. Place captions, title cards, and CTAs consistently across variants.
4. Record per-variant crop and reframing decisions.
5. Mark any clip that should be dropped rather than over-edited.

## Quality Gate

- selected windows preserve source meaning,
- every variant maps to the same source truth,
- runtime is unchanged,
- edit decisions cover every planned clip.
