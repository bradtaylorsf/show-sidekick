---
name: decision-log
description: Log every material production decision with rejected alternatives, honest rationale, and reviewer-auditable runtime choices.
applies_to: meta
cross_refs:
  - specs/14-decision-log.md
  - bundled/skills/meta/announce-and-escalate.md
  - bundled/skills/meta/reviewer.md
---
# Decision Log

Use this skill whenever a production choice affects cost, quality, creative direction, runtime, provider, model, playbook, music, voice, fallback behavior, or user trust. The decision log is not a diary. It is the audit trail that proves the agent considered real alternatives before acting.

Decision entries are written to `projects/<show>/<episode>/decisions.json` and referenced from checkpoints. From proposal onward, `bundled/skills/meta/reviewer.md` audits the log.

## Required Entry Shape

```json
{
  "id": "render_runtime_selection",
  "stage": "proposal",
  "timestamp": "2026-05-12T15:18:42Z",
  "category": "render_runtime_selection",
  "options_considered": [
    {
      "label": "hyperframes",
      "rejected_because": null,
      "notes": "GSAP kinetic typography fits the playbook's audio-reactive treatment."
    },
    {
      "label": "remotion",
      "rejected_because": "React scene library does not have the audio-reactive primitives this brief needs.",
      "notes": null
    }
  ],
  "picked": "hyperframes",
  "reason": "Brief is music-led with audio-reactive kinetic typography; HyperFrames + GSAP best preserves the delivery promise.",
  "confidence": 0.85,
  "user_visible": true,
  "supersedes": null
}
```

## Category Enum

Use these category strings verbatim:

| Category | When | Example |
|---|---|---|
| `pipeline_selection` | Show creation / episode authoring | which pipeline this episode runs |
| `provider_selection` | Asset stage per capability | `flux-pro` vs `imagen-4` vs `recraft-v3` |
| `model_selection` | Asset stage when a provider offers multiple models | `imagen-4` vs `imagen-4-fast` |
| `renderer_family_selection` | Proposal | `cinematic-trailer`, `screen-demo`, `explainer-data` |
| `render_runtime_selection` | Proposal, edit, compose | `remotion` vs `hyperframes` vs `ffmpeg` |
| `playbook_selection` | Proposal | which style playbook the production uses |
| `playbook_override` | Any stage | show-level or episode-level override |
| `music_source` | Proposal for audio-led pipelines | user track vs generated vs royalty-free |
| `motion_commitment` | Proposal | whether the deliverable is motion-led |
| `voice_selection` | Script or asset stage | narrator or character voice |
| `concept_selection` | Proposal | which proposed concept the user approved |
| `fallback_decision` | Any stage | approved substitute when the primary path is blocked |
| `downgrade_approval` | Any stage | intentional reduction in scope or quality |
| `budget_tradeoff` | Any stage | cheaper/faster/lower-risk option chosen |
| `capability_extension` | Any stage | project-scoped script, skill, playbook, or wrapper created |
| `visual_accuracy_check` | Asset stage | generated asset checked against a reference or character sheet |

## Required Entries By Stage

| Stage | Required entries |
|---|---|
| Proposal | `render_runtime_selection`, `renderer_family_selection`, `playbook_selection`, `motion_commitment`, `concept_selection`; add `music_source` for audio-led pipelines |
| Script | `voice_selection` when narration or character voice is in scope |
| Cuesheet | none by default |
| Scene plan | none by default; log only material pivots |
| Assets | `provider_selection` per capability used; `model_selection` when a provider has multiple viable models |
| Edit | `render_runtime_selection` confirmation; `fallback_decision` or `downgrade_approval` if edit deviates from approved plan |
| Compose | final `render_runtime_selection`; `fallback_decision` or `downgrade_approval` if compose substitutes anything |

## Present Both Runtimes Hard Rule

When both Remotion and HyperFrames are available, the proposal-stage `render_runtime_selection` decision must include both in `options_considered`. The agent may recommend one, but it must not silently default.

ffmpeg is also considered when it is realistic for the brief:

- If the brief permits still-led delivery, include `ffmpeg` as a real option.
- If the brief is motion-required, include `ffmpeg` with `rejected_because: "still-image-only; brief requires motion-led delivery."`
- If a runtime is unavailable, include it with `rejected_because: "runtime not available on this machine"` so the log shows the choice was constrained.

A runtime decision with fewer options than the registry shows as available is a critical reviewer finding.

## Rules

1. Every material choice gets a decision entry.
2. `options_considered` must include at least two options. If only one option is configured, include an unavailable alternative and explain why it was rejected.
3. Reasons must be real. "Best option" is not a reason.
4. Confidence must be honest. Do not use `1.0` unless the decision is genuinely certain.
5. User-visible decisions include provider, model, playbook, voice, music, runtime, fallback, downgrade, and budget tradeoff choices.
6. When a decision changes, write a new entry with `supersedes` set to the prior decision id. Never delete the old one.

## Reviewer Audit Hooks

The reviewer checks:

- Required entries exist by stage.
- Each material choice has at least two options considered.
- Runtime decisions present Remotion and HyperFrames when both are available, and include the ffmpeg clause where relevant.
- Reasons are specific to the brief.
- Confidence is not suspiciously perfect across entries.
- Any fallback, downgrade, or runtime swap was approved and logged before execution.
