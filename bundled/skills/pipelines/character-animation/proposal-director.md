---
name: "character-animation-proposal-director"
description: "Lock the character-animation delivery promise, runtime, and sample-first plan."
applies_to: "pipelines/character-animation"
stage: "proposal"
produces: "proposal_packet"
---
# Proposal Director - Character Animation Pipeline

## When To Use

Use this stage after research. The proposal locks the production promise, runtime, character complexity, budget, and sample-first path.

## Runtime Approval

Present the runtime choice explicitly. Remotion is the default for frame-driven character rigs; HyperFrames is viable when the character rig is HTML/SVG/GSAP-native and validation can pass. Log the approved runtime in the decision log so compose can compare against it.

## Process

1. Offer at least three concept options if the user has not already locked one.
2. State the required actions, emotional range, cast, runtime, renderer family, and sample-first plan.
3. Call out rig complexity and any action that may need simplification.
4. Record `render_runtime_selection` with options considered.
5. Require approval before character design begins.

## Quality Gate

- proposal_packet is schema-valid,
- approved runtime is explicit,
- character complexity matches budget and timeline,
- sample-first is planned because character-animation is always sample-first.
