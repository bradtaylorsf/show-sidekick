---
name: "flux-best-practices"
description: "Comprehensive guide for BFL FLUX image generation models. Covers prompting, T2I, I2I, structured JSON, hex colors, typography, multi-reference editing, and model-specific best practices for FLUX.2 and FLUX.1 families."
applies_to: "agents"
agent_skill: true
critical: true
epic: 8
issue: 72
---

## Show Sidekick Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the Show Sidekick registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.
- The source body below is normalized for Show Sidekick paths and terminology while preserving the original operational details.

## Model Identity

BFL FLUX.2 and FLUX.1 image models. Prefer FLUX.2 `pro`, `max`, or `flex` for production image generation, typography, and style-sensitive work; use FLUX.1 Fill/Kontext only when that older family is the explicit tool surface.

## Prompt Structure

`[Subject] + [Action/Pose] + [Style/Medium] + [Context/Setting] + [Lighting] + [Camera/Technical]`. Quote rendered text and state colors with names plus `#RRGGBB` hex values when brand accuracy matters.

## Parameter Defaults

Do not send negative prompts. Pick the model by task: `max` for quality, `pro` for balanced production, `flex` for text/typography, Fill for inpainting. Keep aspect ratio and reference-image roles aligned with the selected tool schema.

## Quality Keywords

specific subject, natural language, precise lighting, lens/camera detail, material texture, brand colors, quoted typography.

## Anti-Patterns

Negative prompts, vague style words, unquoted visible text, missing lighting, conflicting colors, and treating FLUX.1 Kontext as the default when FLUX.2 is available.

# FLUX Best Practices

Use this skill when generating prompts for any BFL FLUX model to ensure optimal image quality and accurate prompt interpretation.

## When to Use

- Creating prompts for FLUX.2 or FLUX.1 models
- Text-to-image (T2I) generation
- Image-to-image (I2I) editing with FLUX.2 models
- Structured scene generation with JSON
- Typography and text rendering
- Multi-reference style transfer
- Color-accurate brand generations

## Quick Reference

### Prompt Structure Formula

```
[Subject] + [Action/Pose] + [Style/Medium] + [Context/Setting] + [Lighting] + [Camera/Technical]
```

### Model Selection

| Use Case            | Recommended Model | Notes                                  |
| ------------------- | ----------------- | -------------------------------------- |
| Fastest generation  | FLUX.2 [klein]    | 4B or 9B, sub-second                   |
| Highest quality     | FLUX.2 [max]      | Best detail, grounding search          |
| Production balanced | FLUX.2 [pro]      | Quality + speed                        |
| Typography/text     | FLUX.2 [flex]     | Best text rendering                    |
| Local/development   | FLUX.2 [dev]      | Open weights                           |
| Image editing       | FLUX.2 [pro/max]  | Pass image URL directly to input_image |
| Inpainting          | FLUX.1 Fill       | Object removal/completion              |
| Context editing     | FLUX.1 Kontext    | Older model, prefer FLUX.2             |

### Critical Rules

1. **NO negative prompts** - FLUX does not support negative prompts; describe what you want
2. **Be specific** - Vague prompts produce mediocre results
3. **Use natural language** - Prose/narrative style works best
4. **Specify lighting** - Lighting has the biggest impact on quality
5. **Quote text** - Use "quoted text" for typography rendering
6. **Hex colors** - Use #RRGGBB format with color description

## Related

For API integration (endpoints, polling, webhooks), see the **bfl-api** skill.

## Rules Reference

Read individual rule files for detailed guidance:

- [flux-best-practices/rules/core-principles.md](flux-best-practices/rules/core-principles.md) - Universal FLUX prompting principles
- [flux-best-practices/rules/flux2-models.md](flux-best-practices/rules/flux2-models.md) - FLUX.2 family: klein, max, pro, flex, dev
- [flux-best-practices/rules/flux1-models.md](flux-best-practices/rules/flux1-models.md) - FLUX.1 family: older generation of FLUX.2 models - pro, Kontext, Fill
- [flux-best-practices/rules/t2i-prompting.md](flux-best-practices/rules/t2i-prompting.md) - Text-to-image prompting patterns
- [flux-best-practices/rules/i2i-prompting.md](flux-best-practices/rules/i2i-prompting.md) - Image-to-image editing with FLUX.2
- [flux-best-practices/rules/json-structured-prompting.md](flux-best-practices/rules/json-structured-prompting.md) - Complex scene composition
- [flux-best-practices/rules/hex-color-prompting.md](flux-best-practices/rules/hex-color-prompting.md) - Precise color specification
- [flux-best-practices/rules/typography-text.md](flux-best-practices/rules/typography-text.md) - Text rendering and typography
- [flux-best-practices/rules/multi-reference-editing.md](flux-best-practices/rules/multi-reference-editing.md) - Multi-image references
- [flux-best-practices/rules/negative-prompt-alternatives.md](flux-best-practices/rules/negative-prompt-alternatives.md) - Positive alternatives
- [flux-best-practices/rules/model-selection-guide.md](flux-best-practices/rules/model-selection-guide.md) - Choosing the right model

## Example Prompt

```
A weathered fisherman in his 70s with deep wrinkles and a salt-and-pepper beard,
wearing a navy cable-knit sweater, standing at the helm of his wooden boat.
Golden hour sunlight from the left creates dramatic rim lighting on his profile.
Shot on Hasselblad with 85mm lens at f/2.8, shallow depth of field with harbor
lights creating soft bokeh in the background. Kodak Portra 400 color science.
```
