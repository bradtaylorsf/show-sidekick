---
name: "animated-explainer-script-director"
description: "Write concise voiceover and visual beats for an animated explainer."
applies_to: "pipelines/animated-explainer"
stage: "script"
produces: "script"
---
# Script Director - Animated Explainer Pipeline

## When To Use

Use this stage after the proposal locks the production path. The script is the narration spine that all visuals follow.

## Shared Visual Contract

Reference `bundled/skills/_shared/video-prompting.md` for visual beat notes that will become generated shots or animated scenes.

## Process

1. Write VO in short sections with estimated timings.
2. Pair each section with one visual beat, not a list of unrelated ideas.
3. Define terms before using them.
4. Keep jokes, metaphors, and character moments subordinate to comprehension.
5. Flag any fact that needs verification before asset generation.

## Output Contract

Produce a schema-valid `script` with section timing, narration text, and visual notes ready for scene planning.
