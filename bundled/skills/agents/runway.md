---
name: "runway"
description: "Runway Gen-4 and Runway-hosted Seedance routing notes for Show Sidekick video generation."
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 73
---

## Show Sidekick Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the Show Sidekick registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.

# Runway Video Provider Notes

Use this companion skill when the video-generation selector or provider tool routes to Runway Video. It is distilled from the original video-generation and Higgsfield model-selection notes and should be read alongside `ai-video-gen`.

## Model Identity

Runway Gen-4 is a premium video-generation surface. Runway can also expose Seedance 2.0 for enterprise/non-US accounts through a provider model parameter.

## Prompt Structure

Focus on motion, not appearance. Keep one scene per clip, name the camera move, action, and style in direct language, and keep the prompt compact enough that the model can execute the movement cleanly.

## Parameter Defaults

Use Runway only when the configured tool/provider supports the requested model. For Seedance through Runway, pass `model="seedance_2.0"` through the registry provider surface. Keep clip specs to the model's current accepted duration, aspect, and media-role schema.

## Quality Keywords

focused motion, simple shot, photoreal, cinematic, controlled camera, clean action, stable subject.

## Anti-Patterns

Do not pack multiple unrelated scenes into a single Runway clip. Do not use Runway as a silent substitute after a Seedance decision without logging the provider change and getting approval.

## Show Sidekick Routing

- Prefer `ai-video-gen` for capability-level provider selection.
- Prefer `seedance-2-0` when the brief requires premium multi-shot motion, native audio, or lip-sync and a configured gateway exists.
- Record provider and model changes in the decision log when they materially affect quality, cost, duration, or output format.
