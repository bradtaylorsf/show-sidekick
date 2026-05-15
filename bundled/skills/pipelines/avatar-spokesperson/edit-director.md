---
name: "avatar-spokesperson-edit-director"
description: "Build edit decisions for avatar timing, captions, support graphics, and variants."
applies_to: "pipelines/avatar-spokesperson"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Avatar Spokesperson Pipeline

## When To Use

Use this stage after avatar, lip-sync, TTS, graphics, and caption assets exist. Build the edit instructions for the approved path.

## Runtime Lock

Preserve the approved runtime in `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Keep presenter timing aligned to script blocks and voice timing.
2. Place captions, lower thirds, graphics, and product visuals outside face and mouth zones.
3. For lip-sync path, preserve mouth-visible timing and avoid edits that create obvious sync breaks.
4. For Narration-Over-Graphics pivot, keep the absence of avatar honest and do not imply presenter footage exists.
5. Record per-platform crop, caption, and avatar-position decisions.

## Quality Gate

- edit decisions follow the approved pivot path,
- runtime is unchanged,
- presenter and captions remain readable,
- avatar or pivot caveats remain attached.
