---
name: "minimax"
description: "MiniMax/Hailuo selection and prompt guidance for Show Sidekick video generation."
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 73
---

## Show Sidekick Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the Show Sidekick registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.

# MiniMax Video Provider Notes

Use this companion skill when the video-generation selector or provider tool routes to MiniMax Video. It is distilled from the original video-generation and Higgsfield model-selection notes and should be read alongside `ai-video-gen`.

## Model Identity

MiniMax Hailuo is a budget-friendly video model with strong natural-physics motion. Use it when the user wants cheaper motion and audio is not required.

## Prompt Structure

Write a concise physical-action prompt: subject, environment, camera, and one clear motion arc. Emphasize observable forces and natural timing.

## Parameter Defaults

Use the provider schema discovered by the registry or model endpoint. Treat no-audio as the default expectation, and verify aspect ratio, duration, and media roles before submission.

## Quality Keywords

natural physics, grounded motion, clear action, smooth camera, coherent subject, practical lighting.

## Anti-Patterns

Do not use MiniMax for native synced audio, lip-sync, or complex multi-shot story beats. Do not downgrade to MiniMax unless budget, speed, or physics fit is the explicit reason.

## Show Sidekick Routing

- Prefer `ai-video-gen` for capability-level provider selection.
- Prefer `seedance-2-0` when the brief requires premium multi-shot motion, native audio, or lip-sync and a configured gateway exists.
- Record provider and model changes in the decision log when they materially affect quality, cost, duration, or output format.
