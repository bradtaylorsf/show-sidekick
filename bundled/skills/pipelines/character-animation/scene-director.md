---
name: "character-animation-scene-director"
description: "Build scenes and an action_timeline from script beats, character design, and rig constraints."
applies_to: "pipelines/character-animation"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Director - Character Animation Pipeline

## When To Use

Use this stage after `character_design` and `rig_plan` are approved. The action_timeline is the master clock; scene boundaries snap to pose holds, action peaks, and transition beats.

## Action Timeline Contract

Produce `action_timeline` alongside `scene_plan`. Each timeline entry must name a character, time, pose or action cycle, transition frames, and easing. The named pose or cycle must be supported by the rig and later pose library.

If action_timeline has actions that cannot be rendered by the rig. return a critical reviewer finding with the exact character, timestamp, action, and missing rig support.

## Process

1. Convert script sections into scene_plan entries with shot language and required assets.
2. Convert every visible acting beat into action_timeline entries.
3. Check every action against `character_design.required_actions` and `rig_plan.joints`.
4. Mark pose_library requirements for the asset stage.
5. Keep action peaks readable by allowing hold frames and anticipation/settle beats.

## Quality Gate

- `scene_plan` validates,
- `action_timeline` validates,
- every required action can be rendered by the rig,
- scenes snap to action milestones instead of arbitrary wall-clock cuts.
