---
name: music-plan
description: how to pick a music source for audio-led pipelines
type: meta
---

# Music Plan

Use this meta skill during proposal for any pipeline whose `master_clock` is not `none`. Audio-led proposals must make the music source explicit before scene planning because the cuesheet depends on the chosen track.

## Required Checking Order

1. check `music_library/` for any user-provided tracks matching mood/tempo;
2. try generation APIs via `registry.select('music_generation')`;
3. try royalty-free sources via `registry.select('music_search')` (freesound, pixabay_music);
4. if no clear winner, present the user explicit choices with at least two ranked options;
5. record the choice as a `music_source` entry in the decision log with options_considered.length ≥ 2 and a concrete reason.

Resolve `music_library/` through `projectPaths(root).musicLibrary` in [`src/paths/project.ts`](../../../src/paths/project.ts). When music is selected, feed it into the audio subsystem cuesheet described in [`specs/07-audio-subsystem.md`](../../../specs/07-audio-subsystem.md).

## Decision Log Requirements

The `music_source` decision is proposal-stage material. Include at least two options even when only one source is actually configured, marking unavailable options with a concrete `rejected_because` value. The picked source can be a user-provided track, generated music, a royalty-free match, or an explicit no-music choice approved by the user.
