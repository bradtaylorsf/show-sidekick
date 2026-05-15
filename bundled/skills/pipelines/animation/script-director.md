---
name: "animation-script-director"
description: "Write voiceover sections with animatable motion jobs."
applies_to: "pipelines/animation"
stage: "script"
produces: "script"
---
# Script Director - Animation Pipeline

## When To Use

Use this stage after the brief. Animation follows the script's timing and emphasis.

## Shared Visual Contract

Reference `bundled/skills/_shared/video-prompting.md` for any generated visual or reference-inspired shot note.

## Process

1. Write short VO sections with estimated start and end times.
2. Assign each section one primary motion job: reveal, transform, compare, path, loop, rhythm, or recap.
3. Avoid motion notes that require multiple complex systems for one beat.
4. Flag any section that needs designer-authored Lottie, GSAP plugin work, or generated visuals.

## Output Contract

Produce a schema-valid `script` with timed sections and animation notes.
