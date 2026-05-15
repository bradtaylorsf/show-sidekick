---
name: "animated-explainer-idea-director"
description: "Shape the learner problem and explanation promise."
applies_to: "pipelines/animated-explainer"
stage: "idea"
produces: "brief"
---
# Idea Director - Animated Explainer Pipeline

## When To Use

Use this stage to define what the audience should understand by the end of the explainer.

## Shared Visual Contract

Reference `bundled/skills/_shared/video-prompting.md` when the brief names visual treatments, reference styles, or generated shot needs. Do not inline a separate five-aspect framework.

## Process

1. Identify the audience, prior knowledge, and the single learner question.
2. Write 2-4 possible explanation angles, then select one.
3. Set target duration, platform, aspect ratio, tone, and playbook.
4. Capture risks: jargon, factual uncertainty, crowded diagrams, or unsupported source claims.

## Output Contract

Produce a schema-valid `brief` plus a `decision_log` entry naming the selected explanation promise and why alternatives were rejected.
