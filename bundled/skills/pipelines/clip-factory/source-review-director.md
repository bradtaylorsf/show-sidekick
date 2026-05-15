---
name: "clip-factory-source-review-director"
description: "Inspect supplied footage and produce scene-detect windows before clip strategy is chosen."
applies_to: "pipelines/clip-factory"
stage: "source_review"
produces: "source_media_review"
---
# Source Review Director - Clip Factory Pipeline

## When To Use

Run this first when the user supplies long-form footage, event recordings, interviews, product demos, webinars, podcasts, or camera files to cut into clips.

## Process

### 1. Review Supplied Footage

Use `source_media_review` to probe every supplied file. Add `scene_detect` for cut boundaries, `frame_sampler` for framing checks, `transcriber` for speech-led clips, and `video_understand` for semantic summaries when useful.

### 2. Build Initial Cut Survey

Record duration, resolution, orientation, audio quality, speaker/action visibility, and scene_detect boundaries. Mark potential windows with start/end timecodes and why each might work.

### 3. Identify Constraints

List sections that should not be clipped: dead air, legal/brand-sensitive content, missing context, weak audio, poor framing, or low information density.

### 4. Handoff To IDEA

Provide the source inventory, candidate windows, content density notes, framing risks, and target-aspect risks.

## Quality Gate

- source_media_review exists for supplied footage,
- scene_detect output is recorded or the failure is explained,
- candidate windows cite source evidence,
- downstream idea selection can start from input-media analysis.
