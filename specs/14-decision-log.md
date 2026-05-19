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

The full enum, used as the `category` field on every decision entry. Naming is normative — reviewer audits and meta skills reference these strings verbatim.

| Category | When | Example |
|---|---|---|
| `pipeline_selection` | Show creation / episode authoring | which pipeline this episode runs (from `show.pipelines`) |
| `provider_selection` | Asset stage (per capability) | `flux-pro` vs `imagen-4` vs `recraft-v3` |
| `model_selection` | Asset stage (per provider when multiple models are available) | `imagen-4` vs `imagen-4-fast` |
| `renderer_family_selection` | Proposal | creative grammar: `explainer-teacher`, `cinematic-trailer`, `documentary-montage`, `product-reveal`, `screen-demo`, `presenter`, `animation-first`, `explainer-data` |
| `render_runtime_selection` | Proposal (technical engine; **must list all available runtimes** in `options_considered`) | `remotion` vs `hyperframes` vs `ffmpeg` |
| `playbook_selection` | Proposal | which style playbook the show/episode runs under |
| `playbook_override` | Any stage | a show-level or episode-level override of a playbook field |
| `music_source` | Proposal (mandatory for audio-led pipelines) | track from `music_library/` vs generated vs royalty-free vs none |
| `motion_commitment` | Proposal | whether the deliverable is motion-led (locks downstream guardrails) |
| `voice_selection` | Script or asset stage | which voice (and why this voice for this character) |
| `concept_selection` | Proposal | which of the proposed concepts the user picked |
| `fallback_decision` | Any stage | when the primary path is blocked and a substitute is approved |
| `downgrade_approval` | Any stage | when the deliverable is intentionally reduced in scope or quality |
| `budget_tradeoff` | Any stage | choosing between cost-tier options (premium model vs faster cheap model) |
| `capability_extension` | Any stage | the agent created a project-scoped tool / script / playbook / skill via `MET-11` |
| `provider_profile_selection` | Preflight / run start | choosing a named provider setup lane such as `paid-demo` |
| `visual_accuracy_check` | Asset stage | when a generated asset's visual fidelity was checked against a reference or character sheet |

Provider-backed sample runs record `provider_profile_selection` before the Runner starts when a provider profile is resolved from CLI, episode, per-pipeline show config, or show defaults. Paid tool announcements in non-interactive runs record `budget_tradeoff` entries before execution.

Repeated image-to-video requests served from cache still write a cost entry with `units: 0`, `usd: 0`, `mode: "sample"`, and `cache_hit: true`. They also record a `budget_tradeoff` decision explaining that the cached clip was reused rather than incurring a new provider call.

## Rules

### Every material choice gets logged

The reviewer audits the decision log on every stage from proposal onward. Missing entries for material choices are `suggestion` (first time) or `critical` (if still missing by edit stage).

### Minimum 2 `options_considered` (schema-enforced)

`options_considered` is `z.array().min(2)`. A single-option entry **fails Zod validation** — the harness rejects the write. To represent "only one option was available," include the unavailable alternative in the array with `rejected_because: "not configured on this machine"` (or equivalent). This preserves the audit trail showing the choice was constrained, not discretionary.

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
| Proposal | `render_runtime_selection`, `renderer_family_selection`, `playbook_selection`, `motion_commitment`, `concept_selection`, plus `music_source` for audio-led pipelines |
| Script | `voice_selection` (per character or single narrator) when narration is in scope |
| Cuesheet | none (subsystem outputs are not "decisions" per se) |
| Scene plan | none (creative choices are in the artifact itself) |
| Assets | `provider_selection` per capability used, `model_selection` per provider when multiple models are available |
| Edit | `render_runtime_selection` (confirms or supersedes proposal entry), `fallback_decision` or `downgrade_approval` if the edit deviates from the scene plan |
| Compose | `render_runtime_selection` (final, must match edit's), `fallback_decision`/`downgrade_approval` if the compose stage substituted |

## Runtime selection rule

The `render_runtime_selection` decision **must list every runtime available on the machine** in `options_considered`. Concretely:

- When both Remotion and HyperFrames are available, both appear in `options_considered`.
- When ffmpeg is a realistic option for the brief (still-led content, no motion-required guardrail), it appears too. For motion-led briefs, ffmpeg may appear with `rejected_because: "still-image-only; brief requires motion-led delivery."`
- When a runtime is unavailable, it still appears with `rejected_because: "runtime not available on this machine"`.

The reviewer flags a `render_runtime_selection` decision with fewer options considered than the registry shows as available (filtered for brief applicability) as `critical`. This prevents silent defaulting.

## What the decision log enables

- **The reviewer can fact-check the agent.** Did the agent really consider both runtimes? The log says so explicitly.
- **The user can re-run with a different choice.** `showkick revise --decision render_runtime_selection --pick remotion` (future feature) re-runs from the relevant stage with a different decision.
- **Post-mortems are tractable.** When a render comes out wrong, the decision log explains the path that was taken — and the alternatives that weren't.
