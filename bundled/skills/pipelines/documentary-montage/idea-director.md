---
name: "documentary-montage-idea-director"
description: "Produce brief for the Documentary Montage pipeline."
applies_to: "pipelines/documentary-montage"
stage: "idea"
produces: "brief"
---
# Idea Director - Documentary Montage

## Goal

Produce a schema-valid `brief.json` artifact that fits the `documentary-montage` pipeline and can be reviewed without private harness context.

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

- The artifact matches `schemas/artifacts/brief.schema.json`.
- The handoff does not refer to sibling repositories, private migration folders, or harness-private project folders.
