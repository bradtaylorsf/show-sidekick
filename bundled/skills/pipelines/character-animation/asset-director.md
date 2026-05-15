---
name: "character-animation-asset-director"
description: "Build editable character assets and a readable pose_library."
applies_to: "pipelines/character-animation"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Character Animation Pipeline

## When To Use

Use this stage after scenes, rig, and action_timeline are approved. Build the editable character package, generated plates if needed, and the `pose_library`.

## Pose Library Design

Read `bundled/skills/agents/pose-library-design.md` and `bundled/skills/agents/svg-character-animation.md` before building poses. A readable pose has a clear silhouette, a named acting purpose, enough hold frames to register, and transitions that reference known poses or rig joints.

If pose_library has no readable acting poses. return a critical reviewer finding and require poses for the exact actions and emotions missing from the library.

## Process

1. Build or collect editable SVG/HTML/Remotion character parts and background assets.
2. Produce `pose_library` with poses for every `character_design.required_actions`.
3. Produce expressions for every `character_design.required_emotions`.
4. Keep all rig source files editable and referenced in `asset_manifest`.
5. Run a small sample pose cycle before batching the full action timeline.

## Quality Gate

- `asset_manifest` validates,
- `pose_library` validates,
- required actions and emotions are covered,
- acting poses are readable at output size,
- source files are editable rather than flattened.
