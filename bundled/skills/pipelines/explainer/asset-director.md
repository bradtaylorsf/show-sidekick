---
name: "animated-explainer-asset-director"
description: "Generate and organize VO, captions, diagrams, and visual assets sample-first."
applies_to: "pipelines/animated-explainer"
stage: "assets"
produces: "asset_manifest"
---
# Asset Director - Animated Explainer Pipeline

## When To Use

Use this stage after the scene plan is approved. Build only the assets needed to fulfill the locked explanation promise.

## Shared Visual Contract

Use `bundled/skills/_shared/video-prompting.md` for every generated visual and `bundled/skills/_shared/shot-prompt-builder.md` to compose final shot prompts.

## Layer 3 Requirement

Layer 3 skills are mandatory before generation. Read `bundled/skills/agents/flux-best-practices.md` before FLUX or BFL image work, and read `bundled/skills/agents/bfl-api.md` before calling the BFL API. Also read the active provider skill for TTS, video, diagram, or caption generation before spending.

## Process

1. Generate or record one VO sample and get approval before batching narration.
2. Generate one representative visual sample for the highest-risk scene before batching images or clips.
3. Reuse diagram, icon, and caption systems across scenes.
4. Keep every asset linked to a scene id and script section.
5. Store provider, prompt, seed, dimensions, cost, and approval state in metadata.

## Output Contract

Produce a schema-valid `asset_manifest` with all file paths, prompt metadata, provider notes, sample approvals, and costs.
