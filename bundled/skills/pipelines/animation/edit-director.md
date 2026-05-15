---
name: "animation-edit-director"
description: "Convert animation scenes and assets into deterministic edit decisions."
applies_to: "pipelines/animation"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Animation Pipeline

## When To Use

Use this stage before compose to lock timeline, runtime, scene timing, and animation density.

## Shared Visual Contract

Use `bundled/skills/_shared/video-prompting.md` when checking generated visuals against the approved scene plan.

## Runtime Lock

Read the `render_runtime` artifact and preserve it in `edit_decisions.render_runtime`. silent runtime swap is a CRITICAL governance violation.

## Process

1. Align scenes to VO timing.
2. Set per-scene frame ranges, transition lengths, and caption windows.
3. Confirm plugin usage remains limited to approved scenes.
4. Downgrade complexity only with an explicit human-approved decision.
5. Flag any non-deterministic animation before compose.

## Output Contract

Produce schema-valid `edit_decisions` with runtime, timeline, scene ranges, transition logic, and validation notes.
