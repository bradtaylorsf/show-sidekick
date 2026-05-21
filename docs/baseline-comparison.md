# Baseline Comparison Report

## Purpose

Use this report to compare equivalent inputs run through a reference baseline and through Show Sidekick. The goal is not to force byte-for-byte parity. The goal is to preserve production intent, catch migration bugs, and separate expected CLI-model differences from provider or creative variance.

Fill one report per demo lane or show benchmark. The Show Sidekick side should come from the demo matrix JSON and verification report. The baseline side comes from the matching reference run and reviewer notes.

## Evidence Model

| Field | Baseline Evidence | Show Sidekick Evidence | Notes |
|---|---|---|---|
| Pipeline slug | Reference workflow or show lane name | `pipeline` from `demo-matrix-verification.json` lane | For show benchmarks, record the show and the actual bundled pipeline separately. |
| Provider choices | Baseline provider/model notes | `decision_log`, provider profile, tool invocations | Include OpenAI, ElevenLabs, Higgsfield, ffmpeg, Remotion, or HyperFrames choices when used. |
| Stage artifacts | Baseline stage outputs | `proposal_packet`, `scene_plan`, `edit_decisions`, `asset_manifest`, `render_report`, `cost_log`, `decision_log`, `final_review`, `publish_log` | Mark absent artifacts as not produced, missing, or not applicable. |
| Render duration | Baseline media metadata | `ffprobe_probe.actual_duration_s`, `render_report.duration_s` | Include promised or expected sample duration. |
| Runtime | Baseline renderer | `render_report.runtime_used`, `edit_decisions.render_runtime` | Expected values include `ffmpeg`, `remotion`, and `hyperframes`. |
| Cost | Baseline estimated or recorded spend | `cost_log`, `matrix_finished.total_cost_usd` when available | Note cached provider hits separately from new spend. |
| Runtime wall clock | Baseline elapsed time | `duration_ms` from lane and matrix events | Use wall-clock duration, not rendered media duration. |
| Export outputs | Baseline handoff files | `export_results`, `publish_log.outputs` | Confirm Premiere XML and EDL when supported. |
| Reviewer findings | Side-by-side review notes | Manual reviewer notes plus `final_review.issues_found` | Include visual, audio, timing, handoff, and prompt-fidelity findings. |

## Difference Categorization

Use exactly one primary category for each material difference. Add a secondary note only when a difference plausibly spans categories.

`migration_bug`: The reference and Show Sidekick inputs are equivalent, but Show Sidekick drops required content, produces invalid or missing artifacts, breaks export handoff, violates the demo brief, or fails a behavior the CLI model is expected to preserve. File a harness bug.

`intentional_cli_difference`: The difference follows from the installed CLI/user-project model, declarative pipeline boundaries, sample-mode limits, or an explicitly accepted harness design choice. Document the reason and confirm the result remains useful for reviewers.

`provider_drift`: The same provider or provider class was asked for equivalent output, but current model behavior, availability, pricing, safety filtering, or cache state changed the result. Record provider, model, date, prompt/input notes, and whether a rerun is needed.

`creative_variance`: The output differs in style, composition, wording, or edit rhythm while still satisfying the brief, artifacts, technical checks, and handoff requirements. Capture reviewer preference notes, but do not treat the variance as a blocker.

## Filling The Template

Start from these machine-readable inputs:

- `demo-matrix-verification.json` from `pnpm demo-matrix --keep-workdir`.
- The `matrix_finished` and per-lane `lane_completed` NDJSON events described in [Demo Matrix](demo-matrix.md).
- Per-lane artifact files under `projects/<show>/<episode>/`, especially `render_report.json`, `asset_manifest.json`, `edit_decisions.json`, `cost_log.json`, `decisions.json`, `final_review.json` when present, and `publish_log.json`.

Add these manual inputs:

- Baseline run notes, including command, date, provider credentials/profile, and operator.
- Baseline media metadata and handoff package locations.
- Reviewer side-by-side findings, with timestamps or artifact paths where possible.

When comparing against a bespoke show benchmark, identify it separately from the generalized seed catalog by recording the starter or show slug, pipeline slug, playbook slug, and reference-media source. Bespoke benchmarks should not be treated as default-pipeline quality gates unless they have been promoted into the public starter matrix.

## Template

```markdown
# Baseline Comparison: <lane-or-show-benchmark>

## Run Metadata

- Date:
- Reviewer:
- Baseline source:
- Show Sidekick command:
- Demo matrix report:
- Difference summary:

## Scope

- Show or starter:
- Pipeline slug:
- Playbook:
- Provider profile:
- Inputs used:

## Evidence

| Field | Baseline | Show Sidekick | Finding |
|---|---|---|---|
| Provider choices |  |  |  |
| Stage artifacts |  |  |  |
| Render duration |  |  |  |
| Runtime |  |  |  |
| Cost |  |  |  |
| Runtime wall clock |  |  |  |
| Export outputs |  |  |  |
| Reviewer findings |  |  |  |

## Differences

| Difference | Category | Evidence | Action |
|---|---|---|---|
|  | `migration_bug` / `intentional_cli_difference` / `provider_drift` / `creative_variance` |  |  |

## Reviewer Notes

- Visual:
- Audio:
- Timing:
- Editor handoff:
- Follow-up:

## Outcome

- Status: pass / pass with notes / fail
- Blocking issues:
- Non-blocking follow-ups:
```
