---
name: "character-animation-character-design-director"
description: "Design or reuse character sheets with required actions and emotional range."
applies_to: "pipelines/character-animation"
stage: "character_design"
produces: "character_design"
---
# Character Design Director - Character Animation Pipeline

## When To Use

Use this stage after the script locks required actions and emotions.

## Recurring cast respect

character-design director consults `shows/<show>/characters/<slug>/` first; new characters flagged `new: true`.

Check `shows/<show>/characters/<slug>/character.yaml` and `shows/<show>/characters/<slug>/references/` before inventing a look. If a requested character is absent, create a new character design entry and mark `new: true` in notes or metadata so the user knows the cast is expanding.

## Cross-References

Read `bundled/skills/agents/character-rigging.md`, `bundled/skills/agents/svg-character-animation.md`, `bundled/skills/agents/pose-library-design.md`, and `bundled/skills/agents/character-animation-qa.md`.

## Process

1. Resolve each character slug against existing show character folders.
2. Produce `character_design` with slug, visual description, references, required actions, and required emotions.
3. Keep the design riggable: separate limbs, head, eyes, mouth, hands, props, and accessories when they need to move.
4. Avoid over-detailed designs that will fail at small sizes or quick poses.
5. Record what is reused and what is newly introduced.

## Reviewer Rule

If character_design lacks required actions or emotional range. return a critical finding with the missing action or emotion names and send the artifact back to this stage.

## Quality Gate

- existing cast is checked first,
- new characters are flagged `new: true`,
- every required action and emotion appears in the design,
- references and visual description are enough for rig planning.
