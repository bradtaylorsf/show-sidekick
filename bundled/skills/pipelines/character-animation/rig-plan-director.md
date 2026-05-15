---
name: "character-animation-rig-plan-director"
description: "Plan pivots, joints, hierarchy, and attachment points for moving character parts."
applies_to: "pipelines/character-animation"
stage: "rig_plan"
produces: "rig_plan"
---
# Rig Plan Director - Character Animation Pipeline

## When To Use

Use this stage after character design approval. The output is the mechanical contract that determines whether later acting is renderable.

## Pivots for moving parts

Every moving part needs an explicit pivot in the same coordinate space as the artwork. Use `bundled/schemas/artifacts/rig_plan.schema.json` and read `bundled/skills/agents/character-rigging.md` before writing the rig.

If rig_plan lacks pivots for moving parts. return a critical reviewer finding and name the exact missing part ids.

## Process

1. List every moving part: head, torso, arms, hands, legs, feet, eyes, pupils, brows, mouth shapes, props, and accessories.
2. Assign parent hierarchy and root parts.
3. Add pivot coordinates, default rotation, and safe range degrees for each moving joint.
4. Add attachment points for props, speech bubbles, labels, or held items.
5. Cross-check required actions and emotions against available joints.

## Quality Gate

- `rig_plan` validates,
- every moving part has pivot coordinates,
- parent hierarchy is explicit,
- ranges support required actions without impossible poses.
