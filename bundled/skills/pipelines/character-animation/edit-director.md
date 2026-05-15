---
name: "character-animation-edit-director"
description: "Build edit decisions that preserve action_timeline timing and readable pose holds."
applies_to: "pipelines/character-animation"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Character Animation Pipeline

## When To Use

Use this stage after the asset package and pose library exist. Build the edit timing, overlays, captions, audio, and runtime notes without changing the approved action_timeline.

## Runtime Lock

Preserve the approved runtime in `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Map each cut to scene_plan, action_timeline, pose_library, and asset ids.
2. Preserve anticipation, action, hold, and settle timing.
3. Keep captions and overlays clear of acting poses and facial expressions.
4. Note any action that should be softened rather than forced beyond the rig.
5. Prepare QA sampling points for compose.

## Quality Gate

- edit decisions preserve action_timeline timing,
- pose holds remain readable,
- cuts reference available assets and poses,
- runtime remains approved.
