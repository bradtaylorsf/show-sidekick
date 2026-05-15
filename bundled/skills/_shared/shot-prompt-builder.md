---
name: "shared-shot-prompt-builder"
description: "Instruction contract for composing five-aspect shot specifications into coherent generation prompts."
applies_to: "shared"
---
# Shared Shot Prompt Builder

Use this helper after a scene director or reference analyst has filled the shared five-aspect video block from `bundled/skills/_shared/video-prompting.md`.

## Composition Contract

`src/prompts/shot-prompt-builder.ts` composes shot prompts in this exact order:

1. Subject
2. Subject Motion
3. Scene
4. Spatial Framing
5. Camera

The helper then appends the active playbook style suffix when supplied. The result should read as one coherent prompt, not five unrelated notes.

## Required Input Shape

```yaml
subject: "<Subject aspect or N/A reason>"
subjectMotion: "<Subject Motion aspect or N/A reason>"
scene: "<Scene aspect, including overlays as their own layer>"
spatialFraming: "<Spatial Framing aspect>"
camera: "<Camera aspect>"
playbookStyle: "<optional active playbook style suffix>"
```

## N/A Handling

Do not drop empty or inapplicable aspects. Pass an explicit N/A reason so the generated prompt includes text such as `Subject: N/A — pure scenery shot.` This preserves analyst intent and keeps downstream prompts unambiguous.

## Phrase Maps

The TypeScript helper exports the preserved phrase maps used by migrated L2P prompt tooling:

- `_SHOT_SIZE_PHRASES`
- `_MOVEMENT_PHRASES`
- `_LIGHTING_PHRASES`
- `_DOF_PHRASES`
- `_COLOR_TEMP_PHRASES`

Use these maps to normalize common shot-size, movement, lighting, depth-of-field, and color-temperature shorthand before writing final prompts.

## Schema Links

- Shared `research_brief` schema: `src/artifacts/research-brief.ts` and `bundled/schemas/artifacts/research_brief.schema.json`.
- Shared `script` schema: `src/artifacts/script.ts` and `bundled/schemas/artifacts/script.schema.json`.
