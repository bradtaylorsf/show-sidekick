---
name: "avatar-spokesperson-idea-director"
description: "Lock the avatar concept, G1 pivot decision, presenter identity, and runtime constraints."
applies_to: "pipelines/avatar-spokesperson"
stage: "idea"
produces: "brief"
---
# Idea Director - Avatar Spokesperson Pipeline

## When To Use

Use this stage when the user wants an avatar or AI presenter to deliver a scripted video. Do not proceed to script until avatar feasibility is decided and logged.

## Pivot Decision Matrix

- If `talking_head` available → standard.
- If `talking_head` unavailable + `lip_sync` available → lip-sync path (presenter plate required).
- If neither → Narration-Over-Graphics pivot offered or block production.

The pivot decision happens at G1 (after IDEA). Do not wait until the ASSETS stage to discover the tool is missing.

Cross-reference `heygen`, `avatar-video`, and `faceswap` before promising any provider-specific avatar, lip-sync, or likeness workflow.

## Reviewer Gate

Any avatar production proceeding past idea without a logged `Pivot Decision` in the decision_log is a CRITICAL reviewer finding that blocks promotion to script.

## Process

1. Check whether `talking_head`, `lip_sync`, and provider-specific avatar paths such as `heygen_video` are available.
2. Apply the Pivot Decision Matrix exactly.
3. Record `Pivot Decision` in decision_log with selected path, rejected path, tool evidence, and whether a presenter plate is required.
4. Define presenter identity, voice direction, target platform, aspect ratio, runtime, and script promise.
5. If neither avatar path is available, offer Narration-Over-Graphics or block production before script.

## Quality Gate

- Pivot Decision is logged at G1,
- selected path follows available tools,
- target aspect and runtime are explicit,
- reviewer can block any missing Pivot Decision as CRITICAL.
