---
name: "kling"
description: "Kling model-selection, prompt-shape, and parameter guidance for predit video generation."
applies_to: "agents"
agent_skill: true
critical: false
epic: 8
issue: 73
---

## predit Usage Contract

- Read this skill before calling any tool that lists it in `agent_skills`.
- Route execution through the predit registry or CLI workflow; do not bypass the harness with ad-hoc tool scripts.
- Announce paid or externally visible generation before running it, and log provider/model decisions when they affect output.
- Keep this skill aligned with `bundled/templates/user-project/AGENTS.md`, `specs/06-tool-registry.md`, `specs/08-skills.md`.

# Kling Video Provider Notes

Use this companion skill when the video-generation selector or provider tool routes to Kling Video. It is distilled from the original video-generation and Higgsfield model-selection notes and should be read alongside `ai-video-gen`.

## Model Identity

Kling 3.0 and Kling 2.6 are Kling video models available through fal.ai and Higgsfield-style gateways. Kling is a lower-cost alternative to Seedance 2.0 for single-plane scenes, anime/stylized clips, motion transfer, and image-to-video anchored by a first frame.

## Prompt Structure

Use the shared video prompt grammar: subject, motion, scene, camera, style, timing. For Kling 2.6 use the original four-part structure from the source prompt guide and the `++emphasis++` syntax only for the highest-priority element.

## Parameter Defaults

`aspect_ratio`: `16:9`, `9:16`, or `1:1`; `duration`: 3-15 seconds for Kling 3.0; `mode`: `pro` for hero quality, `std` only for cheaper iterations; media roles: `start_image` and optionally `end_image`.

## Quality Keywords

cinematic motion, advanced physics, clear subject action, explicit camera motion, coherent first-frame anchoring, natural subject movement.

## Anti-Patterns

Do not choose Kling only because Seedance validation is harder. Avoid long multi-shot choreography when Seedance 2.0 is available and budget allows it. Do not pass unsupported reference roles; validate with the model schema first.

## predit Routing

- Prefer `ai-video-gen` for capability-level provider selection.
- Prefer `seedance-2-0` when the brief requires premium multi-shot motion, native audio, or lip-sync and a configured gateway exists.
- Record provider and model changes in the decision log when they materially affect quality, cost, duration, or output format.
