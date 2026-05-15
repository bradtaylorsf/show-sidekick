---
name: "avatar-spokesperson-executive-producer"
description: "Orchestrate avatar-spokesperson production with G1 pivot governance and capability checks."
applies_to: "pipelines/avatar-spokesperson"
role: "executive-producer"
---
# Executive Producer - Avatar Spokesperson Pipeline

## When To Use

You are the EP for avatar-led spokesperson videos: announcements, product updates, short explainers, course intros, sales enablement, and brand presenter clips. Decide the viable avatar path before the script stage.

## Pipeline state machine

```yaml
state:
  pipeline: avatar-spokesperson
  skill_directory: avatar-spokesperson
  master_clock: none
  locked_decisions:
    pivot_decision: null
    presenter_identity: null
    avatar_path: null
    runtime: remotion
    target_aspects: []
  stages:
    source_review: pending
    idea: pending
    script: pending
    scene_plan: pending
    assets: pending
    edit: pending
    compose: pending
    publish: pending
```

## Mandatory locked decisions

Lock these before the next dependent stage proceeds:

- After `source_review`: reviewed presenter plates, avatar references, rights/consent notes, framing constraints, and source-media risks.
- After `idea`: pivot_decision, presenter identity, avatar path, target aspect, runtime, and whether production continues standard, lip-sync, narration-over-graphics, or blocked.
- Before `script`: `pivot_decision` must exist in decision_log as `Pivot Decision`; production cannot proceed on assumed avatar availability.
- After `script`: final script, voice direction, avatar path notes, and any presenter-plate requirements.
- After `scene_plan`: presenter framing, graphics support, caption-safe zones, and fallback visuals.
- After `assets`: avatar video, lip-sync assets, TTS, graphics, captions, and metadata mapping every asset to the approved path.
- After `edit`: final timing, runtime, caption placement, aspect variants, and pivot-path caveats.

## Validated patterns

- The G1 Pivot Decision is the control point for avatar feasibility.
- Use `talking_head` when a standard avatar provider is available.
- Use `lip_sync` only with a viable presenter plate and rights/consent clarity.
- If neither avatar route exists, offer Narration-Over-Graphics or block production before paid asset work.
- Cross-reference `heygen`, `avatar-video`, and `faceswap` before promising provider-specific output.

## When to stop and check with the human

Stop and ask before proceeding when:

- No `Pivot Decision` is logged at G1.
- `talking_head` and `lip_sync` are both unavailable.
- A lip-sync path lacks a viable presenter plate.
- Rights, consent, likeness, or brand approval is unclear.
- Runtime, avatar path, presenter identity, target aspects, or pivot decision changes after approval.

## Output Contract

Maintain a decision log with source review results, Pivot Decision, rejected avatar paths, provider constraints, rights/consent notes, runtime locks, asset caveats, and publish package notes.
