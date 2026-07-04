---
name: headline-slideshow-edit-director
description: Plan the silent slide timeline for the headline-slideshow smoke pipeline.
applies_to: pipelines/headline-slideshow
stage: edit
produces: edit_decisions
---

# Headline Slideshow Edit Director

## Purpose

Turn the headlines and their stills into a deterministic, silent slide plan. This stage is zero-cost and calls no tools.

## How to run

1. One slide per headline, in `research_brief` order.
2. Fixed 4 seconds per slide, hard cuts, no transitions.
3. Each slide shows the headline's image full-frame (letterboxed or cover-cropped to 1920x1080) with the headline text in a high-contrast band across the lower third.
4. Plan no audio track at all: no music, no voiceover, no ambient bed. The rendered file must have no audio stream.
5. Select the render runtime (`render_runtime`) best suited for text-over-image composition; Remotion is recommended for clean typography, ffmpeg drawtext is an acceptable fallback.

## Output Contract

Return an `edit_decisions` artifact with the slide order, per-slide in/out times, text placement, the total duration (slide count × 4s), and `render_runtime`.

## Quality Bar

- Total duration equals slide count × 4 seconds exactly.
- Every slide references an image file that exists in the `asset_manifest`.
- The plan states explicitly that the output is silent.
