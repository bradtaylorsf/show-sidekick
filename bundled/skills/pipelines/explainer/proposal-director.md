---
name: "animated-explainer-proposal-director"
description: "Offer differentiated explainer concepts and lock runtime choices."
applies_to: "pipelines/animated-explainer"
stage: "proposal"
produces: "proposal_packet"
---
# Proposal Director - Animated Explainer Pipeline

## When To Use

Use this stage to turn the brief into concrete production choices before writing the final script.

## Shared Visual Contract

Use `bundled/skills/_shared/video-prompting.md` when describing generated scenes or reference-driven visual treatments.

## Process

1. Present at least three concept options with different visual metaphors or teaching structures.
2. Recommend one option and explain the tradeoff.
3. Lock `production_plan.render_runtime`, `renderer_family`, `audio_architecture`, delivery promise, sample scope, and budget estimate.
4. Reject concepts that require unavailable providers or too many visual systems.

## Output Contract

Produce a schema-valid `proposal_packet` with a locked runtime and audio architecture. Record the final selection in the decision log.
