---
name: "cinematic-executive-producer"
description: "Orchestrate motion-first cinematic productions with locked direction, audio architecture, runtime, and sample gates."
applies_to: "pipelines/cinematic"
role: "executive-producer"
---
# Executive Producer - Cinematic Pipeline

## When To Use

You are the EP for cinematic teasers, trailers, brand films, dramatic openers, and premium short narrative pieces. Keep the work motion-led, sample-first, and grounded in the approved cinematic promise.

Read `bundled/skills/_shared/video-prompting.md` before approving scene plans or prompts. Read `bundled/skills/agents/seedance-2-0.md`, `bundled/skills/agents/ai-video-gen.md`, and `bundled/skills/core/remotion.md` before approving asset or render choices.

motion is a hard requirement; still-image fallback is forbidden

## Pipeline state machine

```yaml
state:
  pipeline: cinematic
  skill_directory: cinematic
  master_clock: voiceover
  locked_decisions:
    cinematic_promise: null
    audience: null
    render_runtime: null
    renderer_family: cinematic-trailer
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

- After `idea`: audience, platform, target duration, cinematic promise, and playbook.
- After `proposal`: `proposal_packet.production_plan.render_runtime`, `renderer_family: cinematic-trailer`, and `audio_architecture`.
- The proposal stage must lock exactly one of `single_narrator`, `character_dialogue`, or `narrator_plus_characters`.
- After `script`: final speech plan, silence beats, section timing, and whether lines are narrator, character, or mixed.
- After `scene_plan`: five-aspect intent, motion requirement, shot order, overlay safety, and sample candidates.
- After `assets`: approved motion sample, provider choices, prompts, seeds, final asset list, and caption style.

At least 3 genuinely different cinematic directions in concept_options

Do not let a downstream director silently reinterpret a locked decision. If the selected runtime or provider cannot fulfill the locked direction, escalate before changing it.

## Validated patterns

- Voiceover or dialogue timing is the organizing clock; cinematic motion carries emotion and information between lines.
- Every concept option must differ in subject, movement grammar, camera behavior, scene world, and audio architecture implications.
- Use a sample-first workflow for any paid motion generation: one representative hero shot before batching.
- Keep one readable cinematic grammar per piece: lens language, motion intensity, color grade, and shot rhythm should cohere.
- Generated motion uses `bundled/skills/_shared/video-prompting.md`; prompt composition uses `bundled/skills/_shared/shot-prompt-builder.md`.
- Seedance 2.0 is preferred for premium cinematic clips when configured; document any fallback through `video_selector`.

## When to stop and check with the human

Stop and ask before proceeding when:

- The user has not approved the proposal packet.
- Audio architecture is not locked as `single_narrator`, `character_dialogue`, or `narrator_plus_characters`.
- A fallback would replace motion with stills or change the delivery promise.
- The sample motion clip fails the approved direction, camera language, or character identity.
- Runtime, provider, aspect ratio, or platform deliverable would change after approval.

## Output Contract

Maintain a decision log that records locked choices, rejected concept options, sample approvals, runtime or provider escalations, and any deviation from the original cinematic direction.
