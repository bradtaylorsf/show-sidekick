---
name: "talking-head-idea-director"
description: "Select a presenter-led angle grounded in reviewed source footage."
applies_to: "pipelines/talking-head"
stage: "idea"
produces: "brief"
---
# Idea Director - Talking Head Pipeline

## When To Use

Use this stage after `source_media_review` exists. The job is to choose the strongest presenter-led promise that the source can actually support.

## Process

1. Read `source_media_review` before picking a hook.
2. Identify the strongest source moments, likely audience, platform, and target duration.
3. Decide whether the edit is a full talking-head piece, a short clip, or a support-visual explainer around the presenter.
4. List support visuals only when they clarify something the footage cannot show.
5. Record rejected angles and why the source cannot support them.

## Quality Gate

- brief is grounded in reviewed source footage,
- presenter remains the primary asset,
- planned support visuals are justified,
- transcript confidence risks are visible before script.
