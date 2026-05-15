---
name: "animated-explainer-edit-director"
description: "Lock VO timing, scene cadence, overlays, and runtime decisions."
applies_to: "pipelines/animated-explainer"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Animated Explainer Pipeline

## When To Use

Use this stage to turn scenes and assets into concrete timeline decisions before rendering.

## Shared Visual Contract

Use `bundled/skills/_shared/video-prompting.md` when checking that generated visuals still match approved scene intent.

## Runtime Lock

Read `proposal_packet.production_plan.render_runtime` and preserve it in `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Align scene cuts to VO sections.
2. Assign caption timing and safe areas.
3. Define transitions, diagram reveals, and emphasis moments.
4. Confirm that every generated asset maps to the approved scene plan.
5. Flag any runtime or asset mismatch before compose.

## Output Contract

Produce schema-valid `edit_decisions` with timeline, caption, transition, audio, runtime, and variant decisions.
