---
name: "podcast-repurpose-edit-director"
description: "Build edit decisions for chapter-aware podcast clips and platform variants."
applies_to: "pipelines/podcast-repurpose"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Podcast Repurpose Pipeline

## When To Use

Use this stage after podcast segment assets, captions, and reframing plans exist. Build the edit instructions for each clip and variant.

## Runtime Lock

Preserve the approved runtime in `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Keep each cut inside the approved chapter-based window unless a revision explicitly changes the segment.
2. Tighten dead air while preserving the host and guest meaning.
3. Place captions, title cards, waveform accents, and CTAs consistently across variants.
4. Record per-variant crop and reframing decisions.
5. Mark any clip that should be dropped rather than over-edited or decontextualized.

## Quality Gate

- selected windows preserve source meaning,
- every variant maps to the same transcript truth,
- runtime is unchanged,
- edit decisions cover every planned podcast clip.
