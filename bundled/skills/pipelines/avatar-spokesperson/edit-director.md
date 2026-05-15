---
name: "avatar-spokesperson-edit-director"
description: "Produce edit_decisions for the Avatar Spokesperson pipeline."
applies_to: "pipelines/avatar-spokesperson"
stage: "edit"
produces: "edit_decisions"
---
# Edit Director - Avatar Spokesperson

## Goal

Produce a schema-valid `edit_decisions.json` artifact that fits the `avatar-spokesperson` pipeline and can be reviewed without private harness context.

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

- The artifact matches `schemas/artifacts/edit_decisions.schema.json`.
- The handoff does not refer to sibling repositories, private migration folders, or harness-private project folders.
