---
name: "podcast-repurpose-source-review-director"
description: "Inspect supplied podcast media and gather chapter, transcript, and visual-boundary evidence."
applies_to: "pipelines/podcast-repurpose"
stage: "source_review"
produces: "source_media_review"
---
# Source Review Director - Podcast Repurpose Pipeline

## When To Use

Run this first when the user supplies a podcast episode, video podcast recording, webinar-style interview, or long-form conversation to repurpose.

## Process

### 1. Review Supplied Podcast Media

Use `source_media_review` to probe every supplied file. Add `transcriber` for the transcript, `scene_detect` for camera and cut boundaries, `frame_sampler` for speaker framing, and `video_understand` for semantic summaries when useful.

### 2. Build Chapter Inventory

Record explicit chapter markers when present. When chapters are absent, identify transcript topic boundaries, repeated host resets, question changes, sponsor breaks, and high-density sections that could become clips.

### 3. Identify Constraints

List sections that should not be clipped: missing context, sponsor reads, guest caveats, legal or brand-sensitive claims, poor audio, off-camera screen sharing, or weak speaker visibility.

### 4. Handoff To IDEA

Provide chapter markers, transcript topic boundaries, candidate windows, speaker names, content-density notes, scene_detect boundaries, and target-aspect risks.

## Quality Gate

- source_media_review exists for supplied podcast media,
- transcript evidence is recorded or the failure is explained,
- scene_detect output is recorded for video podcasts,
- downstream idea selection can start from chapter and transcript evidence.
