---
name: "veo"
description: "Google Veo prompt and parameter guidance for predit video generation."
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

# Veo Video Provider Notes

Use this companion skill when the video-generation selector or provider tool routes to Veo Video. It is distilled from the original video-generation and Higgsfield model-selection notes and should be read alongside `ai-video-gen`.

## Model Identity

Google Veo 3.1, Veo 3.1 Lite, Veo 3, and Veo 2 are Google video models exposed through provider gateways. Veo is strongest for photoreal landscape, cinematic realism, and batch/volume work when using Lite.

## Prompt Structure

Use one direct paragraph with subject, action, setting, camera movement, lighting, and style. For Veo, keep instructions specific and avoid competing camera directions.

## Parameter Defaults

`aspect_ratio`: `16:9` or `9:16` for Veo 3.1; `duration`: `4`, `6`, or `8`; `quality`: `basic`, `high`, or `ultra`; media role: one `start_image` for Veo 3.1 or one `image` for Veo 3.

## Quality Keywords

ultra-realistic, cinematic, natural motion, grounded physics, detailed lighting, coherent camera, realistic ambience.

## Anti-Patterns

Do not submit unsupported aspect ratios or long durations. Do not route to Veo just because it is familiar if Seedance 2.0 better matches multi-shot, lip-sync, or native synced-audio requirements.

## predit Routing

- Prefer `ai-video-gen` for capability-level provider selection.
- Prefer `seedance-2-0` when the brief requires premium multi-shot motion, native audio, or lip-sync and a configured gateway exists.
- Record provider and model changes in the decision log when they materially affect quality, cost, duration, or output format.

## Source Appendix

Read the mirrored source prompt note when available: `bundled/skills/creative/prompting/veo-prompting.md`.
