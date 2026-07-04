---
name: headline-slideshow-compose-director
description: Render the silent headline slideshow to a single mp4 for the headline-slideshow smoke pipeline.
applies_to: pipelines/headline-slideshow
stage: compose
produces: render_report
---

# Headline Slideshow Compose Director

## Purpose

Render the slide plan into one silent mp4 and prove it with a validated `render_report`.

## How to run

1. Execute the `edit_decisions` plan with the selected render runtime via the tool registry (`video_compose`, or `remotion` / `ffmpeg` when the plan calls for them). Do not shell out around the registry.
2. Render 1920x1080 at 30fps, H.264, **no audio stream** (for ffmpeg-based composition use `-an`; for Remotion render without an audio track).
3. Validate the output with ffprobe: file exists, duration matches the plan within 0.5s, exactly one video stream, zero audio streams.
4. Sample 2–3 frames (one per distinct slide where possible) and confirm the headline text is legible over the image; the visual-qa or frame-sampler tools are available for this.

## Output Contract

Return a `render_report` artifact recording the output file path, duration, resolution, stream layout (video-only), per-slide timing as rendered, and the sampled-frame check results.

## Quality Bar

- The mp4 has no audio stream — a slideshow with any audio fails this pipeline's contract.
- Every headline from the `research_brief` appears exactly once in the rendered output.
- The render is reproducible from the artifacts alone (no state outside the episode workspace).
