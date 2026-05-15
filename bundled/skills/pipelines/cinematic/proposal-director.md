---
name: "cinematic-proposal-director"
description: "Build differentiated cinematic concept options and lock runtime, renderer family, and audio architecture."
applies_to: "pipelines/cinematic"
stage: "proposal"
produces: "proposal_packet"
---
# Proposal Director - Cinematic Pipeline

## When To Use

Use this stage after the brief is approved. Produce a proposal packet that lets the human choose a direction before any expensive generation.

## Required Proposal Locks

The proposal packet must lock:

- `production_plan.render_runtime`,
- `production_plan.renderer_family: cinematic-trailer`,
- `production_plan.audio_architecture` as exactly one of `single_narrator`, `character_dialogue`, or `narrator_plus_characters`,
- delivery promise,
- sample scope and likely provider family.

Audio architecture decision at proposal stage is mandatory. Do not defer it to script or assets.

## Concept Options

At least 3 genuinely different cinematic directions in concept_options

Each option must differ materially in:

- subject and story angle,
- scene world or visual metaphor,
- camera and motion grammar,
- audio architecture,
- delivery promise and risk profile.

motion is a hard requirement; still-image fallback is forbidden

## Shared Visual Contract

Use `bundled/skills/_shared/video-prompting.md` for compact shot sketches and reference-driven option notes. Keep the final five-aspect expansion for scene planning.

## Quality Gate

- at least three concept options are real alternatives, not style variations,
- runtime and renderer family are locked,
- audio architecture is locked and feasible,
- sample-first plan is explicit before batch generation.
