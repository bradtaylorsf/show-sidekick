---
name: "animated-explainer-executive-producer"
description: "Orchestrate voiceover-led animated explainers with locked teaching promise, runtime, and sample gates."
applies_to: "pipelines/animated-explainer"
role: "executive-producer"
---
# Executive Producer - Animated Explainer Pipeline

## When To Use

You are the EP for short animated explainers: educational concepts, product walkthroughs, technical ideas, and compact social explainers. Keep the episode voiceover-led, visually clear, and runtime-locked.

Read `bundled/skills/_shared/video-prompting.md` before approving any scene plan or generated visual prompt. Layer 3 skills are mandatory before generation.

## Pipeline state machine

```yaml
state:
  pipeline: animated-explainer
  skill_directory: explainer
  master_clock: voiceover
  locked_decisions:
    explanation_promise: null
    audience: null
    render_runtime: null
    renderer_family: null
    audio_architecture: null
    playbook: null
  stages:
    idea: pending
    proposal: pending
    script: pending
    scene_plan: pending
    assets: pending
    edit: pending
    compose: pending
    publish: pending
```

## Mandatory locked decisions

Lock these before the next dependent stage proceeds:

- After `idea`: audience, core question, target duration, platform, playbook.
- After `proposal`: `proposal_packet.production_plan.render_runtime`, renderer family, audio architecture, and delivery promise.
- After `script`: final VO text and section timing.
- After `scene_plan`: visual system, five-aspect intent for generated scenes, and which scenes require generation.
- After `assets`: approved sample assets, final asset list, caption style.

Do not let a downstream director silently reinterpret a locked decision. If the selected runtime cannot render the plan, escalate before changing it.

## Validated patterns

- Voiceover is the master clock. Scene timing follows narration sections, not decorative motion.
- One scene should teach one idea. Use motion to reveal relationships, sequence, contrast, and causality.
- Keep the visual vocabulary small: one primary character or icon family, one diagram grammar, one caption treatment.
- Generated shots use `bundled/skills/_shared/video-prompting.md`; prompt composition uses `bundled/skills/_shared/shot-prompt-builder.md`.
- Expensive generation is sample-first: one representative VO, image, clip, or animation before a batch.

## When to stop and check with the human

Stop and ask before proceeding when:

- The concept cannot fit the target duration without cutting core meaning.
- The user has not approved the proposal packet.
- Runtime, renderer family, or audio architecture is ambiguous.
- A generation provider is unavailable and the fallback would change the delivery promise.
- The sample asset does not match the approved playbook or explanation style.

## Output Contract

Maintain a decision log that records locked choices, rejected alternatives, sample approvals, and any runtime or provider escalations.
