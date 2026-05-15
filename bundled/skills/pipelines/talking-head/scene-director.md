---
name: "talking-head-scene-plan-director"
description: "Produce scene_plan for the Talking Head pipeline."
applies_to: "pipelines/talking-head"
stage: "scene_plan"
produces: "scene_plan"
---
# Scene Plan Director - Talking Head

## Goal

Produce a schema-valid `scene_plan.json` artifact that fits the `talking-head` pipeline and can be reviewed without private harness context.

## Inputs

Read the episode, show defaults, playbook, and all required prior artifacts declared in the manifest. If an expected input is missing, stop and report the missing artifact rather than inventing it.

## Workflow

1. Restate the lane-specific objective in one sentence.
2. Use only registry-backed tools or user-provided fixtures listed by the manifest.
3. Keep sample mode small when `sample_mode_supported` is true.
4. Write the artifact with clear paths, costs, assumptions, and handoff notes.

## Review Focus

Check that the artifact matches the stage intent, names unresolved risks, and keeps the downstream handoff concrete.

## Success Criteria

- The artifact matches `schemas/artifacts/scene_plan.schema.json`.
- The handoff does not refer to sibling repositories, private migration folders, or harness-private project folders.
