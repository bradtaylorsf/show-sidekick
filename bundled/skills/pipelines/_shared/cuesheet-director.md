---
name: cuesheet-director
description: Build and review the audio cuesheet before scene planning.
applies_to: ["cuesheet"]
produces: cuesheet
requires_context: ["episode", "audio"]
---

# Cuesheet Director

## Goal

Produce trustworthy `projects/<show>/<episode>/cuesheet.json`, `audio_energy.json`, and, when lyrics are supplied, `lyrics_aligned.json` so scene planning can snap visuals to the actual audio structure and lyric phrase windows.

## Workflow

1. Build or load the cuesheet with the audio subsystem.
2. Confirm `audio_energy.json` exists for music-led tracks and `lyrics_aligned.json` exists when lyrics are supplied.
3. Inspect the transcript, sections, beat grid, lyric phrase windows, and climax points before accepting the artifact.
4. Revise labels or climax points when the algorithm is plausible but not perceptually right.
5. Leave the final cuesheet and timing artifacts readable for the next stage.

## Transcript Review

- If `transcription_confidence.low_confidence` is true, treat the transcript as suspect and flag it for script-stage review.
- Correct obvious word errors before downstream script or caption work depends on them.
- Keep confidence metadata intact when manually revising transcript text.

## Lyric Alignment Review

- When lyrics are present, use `lyrics_aligned.json` as the lyric timing source.
- Do not guess lyric timing from line order when `lyrics_aligned` phrase windows are available.
- Resolve flagged or unmatched lyric lines with `lyrics_alignment_overrides.json` manual corrections before script or scene planning depends on them.

## Section Review

- Confirm section starts line up with audible changes, not just minor loudness movement.
- Label sections as `vocal`, `instrumental`, or `silence` based on what is actually present.
- Keep chorus, hook, bridge, intro, outro, and break labels human-readable when revising.
- Treat a section label as suspect if it conflicts with transcript presence or obvious silence.

## Climax Review

- Confirm each climax point is within 200 ms of the perceptual peak, drop, arrival, or release.
- Remove instrumental false peaks when the edit should land on a later vocal or hook moment.
- For a manual correction, set `source: "manual"` so future `buildCuesheet` runs preserve it.
- Use `source: "agent"` only for agent-reviewed placements that should survive algorithm reruns but are not direct user overrides.

## Quality Bar

- The cuesheet has sections, beats when the track is rhythmic, `audio_energy`, and no unsupported climax points.
- Track + lyrics episodes have schema-valid `lyrics_aligned` phrase windows.
- The beat grid is close enough that downbeat snapping would look intentional.
- Manual changes are minimal, explained in nearby notes or decision logs, and preserve the schema.

## What To Avoid

- Do not accept a climax point just because it is the loudest sample.
- Do not relabel long music beds as vocal unless transcript words overlap the range.
- Do not hand-edit generated timing without checking the audio around that timestamp.
