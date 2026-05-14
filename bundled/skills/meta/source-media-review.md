---
name: source-media-review
description: Ground user-supplied media in ffprobe/transcript facts before planning uses it.
applies_to: meta
cross_refs:
  - specs/13-reviewer-protocol.md
  - src/artifacts/source-media-review.ts
  - src/tools/source-media-review.ts
---
# Source Media Review

Use this whenever the user provides media files and a downstream stage might make creative or technical assumptions about them. Do the review before script, scene planning, clip selection, localization, talking-head editing, or documentary montage planning depends on the files.

## Required Tool Path

Use the registry tool `source_media_review` for the first pass. It runs ffprobe and produces a `source_media_review` artifact. For speech-bearing media, also sample the transcript with the configured transcription tool when available.

## Protocol

1. List every user-supplied file that matters to the requested production.
2. Run ffprobe through `source_media_review`.
3. For video/audio with speech, run transcription or transcript sampling when available.
4. Write a `content_summary` for each file that cites at least two concrete probe fields by name.
5. Add `planning_implications` for quality risks such as low resolution, mono audio, missing audio, very short duration, or mismatched aspect.
6. Pass the artifact to every planning stage that refers to the source media.

## Content Summary Rule

Each `content_summary` must reference at least two fields from `technical_probe`, using the field names directly. This is schema-enforced.

Good:

```text
Probe cites duration_s=92.4 and width=1920; transcript sample indicates a two-speaker product walkthrough.
```

Bad:

```text
This looks like a product demo.
```

The bad example is a hallucination risk because it does not prove that the file was inspected.

## Transcript Sampling

When a transcript is available:

- Sample enough text to identify speaker count, topic, and usable moments.
- Do not paste full transcripts into the review artifact.
- Include confidence or timing caveats when the transcription tool exposes them.
- If diarization is unavailable, say so; do not invent speaker labels.

## Hallucination Guards

- Never infer content from the filename alone.
- Never mark `reviewed: true` unless a real probe ran.
- Do not claim an audio track exists unless ffprobe shows one.
- Do not claim resolution, duration, codec, or frame rate unless it appears in `technical_probe`.
- If ffprobe fails, surface a blocker or mark the file unreviewed; do not proceed as if it worked.

## Reviewer Hooks

The reviewer flags these as critical:

- A plan references source-media content without a `source_media_review` artifact.
- `content_summary` cites fewer than two probe fields.
- A plan assumes speech, visuals, aspect ratio, or duration that the probe contradicts.
- A file was marked reviewed when probe data is empty.
