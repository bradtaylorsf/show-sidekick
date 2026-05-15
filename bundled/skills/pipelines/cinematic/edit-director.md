---
name: "cinematic-edit-director"
description: "Build edit decisions that preserve the locked cinematic runtime and motion arc."
applies_to: "pipelines/cinematic"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Cinematic Pipeline

## When To Use

Use this stage after cinematic motion, speech, captions, and support assets exist. Build the timeline instructions for a rough cut and NLE handoff.

## Runtime Lock

Read `proposal_packet.production_plan.render_runtime` and preserve it in `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Order shots to preserve the approved cinematic arc: hook, escalation, reveal, release, close.
2. Cut on motion continuity when possible; avoid repeating the same camera move back to back.
3. Keep speech timing, silence, and sound-design windows from the script.
4. Mark overlays and captions as independent layers.
5. Record any clip that should be regenerated instead of hidden by a cut.

## Quality Gate

- render runtime matches the proposal packet,
- motion continuity is clear,
- audio architecture is intact,
- edit decisions can produce every planned deliverable.
