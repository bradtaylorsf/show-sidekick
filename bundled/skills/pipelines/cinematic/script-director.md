---
name: "cinematic-script-director"
description: "Write voiceover or dialogue timed to the locked cinematic direction."
applies_to: "pipelines/cinematic"
stage: "script"
produces: "script"
---
# Script Director - Cinematic Pipeline

## When To Use

Use this stage after the proposal is approved. Write a script that respects the locked audio architecture and leaves room for motion, silence, and sound design.

## Inputs

Use the approved `brief` and `proposal_packet`. Preserve `production_plan.audio_architecture` exactly: `single_narrator`, `character_dialogue`, or `narrator_plus_characters`.

## Process

1. Segment the piece into timed beats with speech, silence, and motion jobs.
2. Write only the lines that need to be spoken; let motion carry reveals, contrast, scale, and consequence.
3. Mark each spoken line as narrator or character according to the locked audio architecture.
4. Keep section timings realistic for cinematic pacing: short lines, readable pauses, and room for transitions.
5. Record any scene implication that the scene director must satisfy.

## Quality Gate

- speech plan matches the locked audio architecture,
- every line has a reason to exist,
- motion jobs are clear enough for scene planning,
- no line requires a visual that the proposal did not approve.
