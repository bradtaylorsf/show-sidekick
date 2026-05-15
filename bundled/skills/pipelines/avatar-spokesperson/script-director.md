---
name: "avatar-spokesperson-script-director"
description: "Write avatar-ready spokesperson copy for the approved pivot path."
applies_to: "pipelines/avatar-spokesperson"
stage: "script"
produces: "script"
---
# Script Director - Avatar Spokesperson Pipeline

## When To Use

Use this stage only after the idea stage logs a `Pivot Decision`. The script must fit the approved avatar path, presenter constraints, and target runtime.

## Process

1. Confirm the decision_log contains `Pivot Decision`.
2. Write concise, speakable presenter copy with short sentences and clear breath points.
3. Add pronunciation notes for names, acronyms, product terms, and brand phrases.
4. Mark any line that needs a gesture, graphic, product visual, or caption emphasis.
5. For lip-sync path, respect presenter-plate duration, framing, and visible-mouth constraints.

## Quality Gate

- script fits the approved pivot path,
- copy is speakable by an avatar or TTS voice,
- protected terms and pronunciation notes are visible,
- no unsupported avatar capability is assumed.
