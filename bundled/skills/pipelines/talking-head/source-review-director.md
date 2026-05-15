---
name: "talking-head-source-review-director"
description: "Inspect user-supplied talking-head footage before script or edit decisions."
applies_to: "pipelines/talking-head"
stage: "source_review"
produces: "source_media_review"
---
# Source Review Director - Talking Head Pipeline

## When To Use

Run this first when the episode includes user-supplied talking-head video, interview footage, presenter recordings, or camera audio.

User-supplied video produces source_media_review before script proceeds.

## Process

### 1. Review Supplied Media

Use the registry tool `source_media_review` for each supplied video. Add `scene_detect`, `frame_sampler`, `transcriber`, and `video_understand` only when they clarify source quality, speaker content, framing, or reusable sections.

### 2. Capture Technical Facts

Record duration, resolution, codec, frame rate, audio stream, orientation, visible speaker framing, lighting, and any mouth/eye occlusion risks.

### 3. Capture Transcript Risks

If speech is present, note transcript confidence ranges, noisy sections, crosstalk, jargon, names, and words likely to need review before captions.

### 4. Handoff To IDEA And SCRIPT

Mark strong source moments, weak sections, potential hooks, support-visual opportunities, and any sections that should not be used.

## Quality Gate

- every supplied video is reviewed or explicitly marked out of scope,
- summaries cite technical probe fields,
- transcript and subtitle risks are explicit,
- downstream stages have `source_media_review` before script work begins.
