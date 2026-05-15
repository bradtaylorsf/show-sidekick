---
name: "character-animation-publish-director"
description: "Package character animation renders, source rigs, QA notes, and editor handoff."
applies_to: "pipelines/character-animation"
stage: "publish"
produces: "publish_log"
---
# Publish Director - Character Animation Pipeline

## When To Use

Use this stage after compose and QA pass. Package the rendered output, source rig files, pose library, action timeline, QA notes, and NLE handoff.

## Process

1. Include render output, NLE handoff files, rig source, pose_library, action_timeline, and character_qa_report.
2. Include recurring-cast updates: reused character folders, new characters marked `new: true`, and suggested files to persist under `shows/<show>/characters/<slug>/`.
3. Surface any QA warnings or rig limitations for the human editor.
4. Preserve runtime and provider decisions in the publish log.

## Quality Gate

- `publish_log` validates,
- editor handoff includes source animation files,
- QA caveats are visible,
- recurring-cast updates are documented.
