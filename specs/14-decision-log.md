# 14 — Decision Log

## Why

Production runs make dozens of material choices: which TTS provider, which image model, which render runtime, which music track, which voice, which playbook, what to do when the primary path is blocked. The decision log is the cumulative audit trail of those choices. It lets the user (and the reviewer) verify that the agent considered alternatives, gave honest reasons, and didn't quietly substitute one path for another.

## Location

```
projects/<show>/<episode>/decisions.json
```

Validated against `schemas/artifacts/decision_log.schema.json`. The cumulative log is referenced from each checkpoint's `decision_log_ref`.

## Entry shape

```json
{
  "id": "render_runtime_selection",
  "stage": "proposal",
  "timestamp": "2026-05-12T15:18:42Z",
  "category": "runtime",
  "options_considered": [
    {
      "label": "hyperframes",
      "rejected_because": null,
      "notes": "GSAP kinetic typography fits the playbook's audio-reactive treatment."
    },
    {
      "label": "remotion",
      "rejected_because": "React scene library doesn't have the audio-reactive primitives this brief needs.",
      "notes": null
    },
    {
      "label": "ffmpeg",
      "rejected_because": "Still-image-only; brief requires motion-led delivery.",
      "notes": null
    }
  ],
  "picked": "hyperframes",
  "reason": "Brief is music-led with audio-reactive kinetic typography; HyperFrames + GSAP is the natural fit.",
  "confidence": 0.85,
  "user_visible": true,
  "supersedes": null
}
```

## Categories

Standard categories the harness expects to see entries for, across stages:

| Category | When | Example |
|---|---|---|
| `runtime` | Proposal (or earlier if the brief constrains it) | `hyperframes` vs `remotion` vs `ffmpeg` |
| `provider` | Asset stage (per capability) | `imagen-4` vs `flux-pro` vs `recraft-v3` |
| `model` | Asset stage (within a provider) | `kling-v2.1-pro` vs `kling-v1.6-standard` |
| `playbook` | Proposal | which style playbook the show/episode runs under |
| `music` | Proposal | track from `music_library/` vs generated vs no music |
| `voice` | Script or asset stage | which ElevenLabs voice (and why this voice for this character) |
| `pipeline` | Onboarding / show creation | which pipeline this episode runs |
| `fallback` | Any stage | when the primary path is blocked and a substitute is approved |
| `downgrade` | Any stage | when the deliverable is intentionally reduced in scope or quality |

## Rules

### Every material choice gets logged

The reviewer audits the decision log on every stage from proposal onward. Missing entries for material choices are `suggestion` (first time) or `critical` (if still missing by edit stage).

### Minimum 2 `options_considered`

Even when the agent is confident, log the rejected alternatives. A decision with one option considered hides the tradeoffs from the user.

### Real reasons

`"reason"` is freeform but must reflect the actual decision logic, not boilerplate. `"best option"` is not a reason. `"chose the configured provider because the other two require keys we don't have"` is.

### Confidence is honest

`confidence: 1.0` on every entry is a red flag. Provider selection almost always involves tradeoffs. The reviewer flags suspicious confidence patterns.

### `user_visible` marks the entries the user should see

Internal routing decisions (e.g. cache hit vs cache miss, which CDN to fetch from) should be `user_visible: false`. Provider, model, playbook, voice, music, and runtime selections are `user_visible: true`.

### Superseding

When a decision is changed mid-run (e.g. the user revises the proposal and a different runtime is picked), the new entry sets `supersedes: "<prior_id>"`. Prior entries are not deleted — the audit trail preserves the full history.

## Required entries by stage

| Stage | Required entries |
|---|---|
| Proposal | `runtime`, `playbook`, `music`, plus `voice` if narration is in scope |
| Script | `voice` (per character or single narrator) |
| Cuesheet | none (subsystem outputs are not "decisions" per se) |
| Scene plan | none (creative choices are in the artifact itself) |
| Assets | `provider` per capability used, `model` per provider |
| Edit | `runtime` (confirms or supersedes proposal entry), any `fallback` or `downgrade` if the edit deviates from the scene plan |
| Compose | `runtime` (final, must match edit's), `fallback`/`downgrade` if the compose stage substituted |

## Runtime selection rule

When both Remotion and HyperFrames are available on the machine, the `runtime` decision **must** list both in `options_considered` — even if the picked option seems obvious. The reviewer flags a `runtime` decision with only one option considered (when both were available) as `critical`. This prevents silent defaulting.

If a runtime was unavailable, list it anyway with `rejected_because: "runtime not available on this machine"`. The audit trail records that the choice was constrained, not discretionary.

## What the decision log enables

- **The reviewer can fact-check the agent.** Did the agent really consider both runtimes? The log says so explicitly.
- **The user can re-run with a different choice.** `predit revise --decision render_runtime_selection --pick remotion` (future feature) re-runs from the relevant stage with a different decision.
- **Post-mortems are tractable.** When a render comes out wrong, the decision log explains the path that was taken — and the alternatives that weren't.
