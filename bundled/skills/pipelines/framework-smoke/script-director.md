---
name: framework-smoke-script-director
description: Run the zero-cost script stage for the framework-smoke pipeline.
applies_to: pipelines/framework-smoke
stage: script
produces: script
---

# Framework Smoke Script Director

## Purpose

Verify that the harness can consume a prior research artifact and produce a schema-valid script artifact without external generation.

## Inputs

Use the completed `research_brief` artifact from the research stage. If it is missing, revise instead of inventing facts.

## Output Contract

Return a `script` artifact with:

- `title`
- `beats`
- `voiceover`
- `notes`
- `ready_for_review`

## Quality Bar

The script is short, deterministic, and suitable for a sample-mode framework smoke run with zero API keys.
