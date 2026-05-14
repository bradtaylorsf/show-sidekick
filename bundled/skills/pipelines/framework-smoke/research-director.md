---
name: framework-smoke-research-director
description: Run the zero-cost research stage for the framework-smoke pipeline.
applies_to: pipelines/framework-smoke
stage: research
produces: research_brief
---

# Framework Smoke Research Director

## Purpose

Verify that a schema-valid research_brief artifact can move through the harness without tools or API keys.

## Inputs

Use the episode title, user-provided inputs, and any project-local notes already present. Do not call external services.

## Output Contract

Return a `research_brief` artifact with:

- `topic`
- `known_inputs`
- `assumptions`
- `open_questions`
- `ready_for_script`

## Quality Bar

The artifact is deterministic, concise, and safe to run in `--sample` mode with zero API keys.
