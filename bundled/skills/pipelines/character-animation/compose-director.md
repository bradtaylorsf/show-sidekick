---
name: "character-animation-compose-director"
description: "Render character animation with approved runtime and character QA."
applies_to: "pipelines/character-animation"
stage: "compose"
produces: "render_report"
---
# Compose Director - Character Animation Pipeline

## When To Use

Use this stage to build, validate, render, and review the character animation.

## Runtime Approval Check

Compare the runtime used at compose with `proposal_packet.production_plan.render_runtime` and the decision log. Compose used a runtime not approved in proposal. is a critical reviewer finding. silent runtime swap is a CRITICAL governance violation.

## Character QA

Read `bundled/skills/agents/character-animation-qa.md`, then validate schema, static assets, browser preview, motion frame deltas, final MP4, and visual acting readability.

## Process

1. Render through the approved runtime and registry-backed `video_compose` or `character_animation` path.
2. Run runtime lint or validation where available.
3. Sample frames at action peaks and holds.
4. Verify joints stay connected, expressions read, and motion is nonblank.
5. Produce `render_report`, `final_review`, and `character_qa_report`.

## Quality Gate

- runtime matches proposal approval,
- character QA passes,
- render output exists and probes cleanly,
- acting poses read in sampled frames,
- no detached parts, broken pivots, or impossible rig motions remain.
