# 05 — Pipelines and Harness Runtime

## Where pipelines live

Pipelines are bundled with the harness and cached locally inside the user project at `.show-sidekick/pipelines/`. Users may override any pipeline by placing a same-named file at `<project>/pipelines/<slug>.yaml` — the resolver checks the local path first, then falls back to the cache. See [`10-installation-and-user-projects.md`](10-installation-and-user-projects.md).

A pipeline is *referenced* from a show via the `show.pipelines: { <name>: { ... } }` map (see [`04-shows-and-episodes.md`](04-shows-and-episodes.md) → "Pipeline binding"). A show may reference multiple pipelines. The harness rejects an episode that names a pipeline the show doesn't declare in its `pipelines` map.

Bundled demo-readiness slugs are governed by `src/pipelines/demo-inventory.ts` and documented in [`docs/demo-readiness.md`](../docs/demo-readiness.md). New bundled manifests must be added to that inventory in the same change, and show-only concepts must stay out of `bundled/pipelines/`.

## Manifest schema

Pipelines are declarative YAML manifests at `pipelines/<slug>.yaml` (or the bundled equivalent in `.show-sidekick/pipelines/<slug>.yaml`). They describe the workflow; how-to lives in stage director skills (Markdown).

```yaml
slug: music-video
display_name: "Music Video"
description: "Vertical music videos for AI-generated music tracks"
status: production                       # production | beta | experimental
sample_support: both                     # zero-key | paid | both | unsupported
master_clock: audio                      # audio | voiceover | none
stage_order: canonical                   # canonical | manifest; defaults to canonical
default_checkpoint_policy: guided

defaults:
  aspect: "9:16"
  duration_strategy: track_length        # track_length | brief | custom
  max_scene_duration_s: 5
  render_runtime: hyperframes

orchestration:
  mode: executive-producer
  skill: pipelines/music-video/executive-producer.md
  budget_default_usd: 6.00
  max_revisions_per_stage: 3
  max_send_backs: 3
  max_wall_time_minutes: 60

extensions:
  custom_scripts: true
  custom_playbooks: true
  custom_skills: true
  custom_tools: false

required_skills:
  - pipelines/music-video/executive-producer.md
  - pipelines/music-video/idea-director.md
  - meta/reviewer

compatible_playbooks:
  recommended: [clean-professional]
  also_works: [flat-motion-graphics]
  custom_allowed: true

stages:
  - slug: idea
    skill: pipelines/music-video/idea-director.md
    produces: brief
    produces_artifacts: [brief, decision_log]
    required_artifacts_in: []
    optional_artifacts_in: []
    required_tools: []
    optional_tools: []
    tools_available: [research, web_search]
    checkpoint_required: true
    review_focus: [hook_strength, concept_clarity, track_understanding]
    success_criteria:
      - concept_count: ">= 4"
      - track_analyzed: true
    human_approval: required             # required | optional | never

  - slug: script
    skill: pipelines/music-video/script-director.md
    produces: lyric_treatment
    tools_available: []
    human_approval: required

  - slug: cuesheet
    skill: pipelines/_shared/cuesheet-director.md
    produces: cuesheet
    audio_sync: build                    # build | required | none
    tools_available: [whisper, aubio]
    success_criteria:
      - sections_detected: ">= 3"
      - beats_detected: true
    human_approval: optional

  - slug: scene_plan
    skill: pipelines/music-video/scene-director.md
    produces: scene_plan
    audio_sync: required
    tools_available: [image_generation]
    success_criteria:
      - all_scenes_anchored: true
      - max_scene_duration_s: "<= 5"
    human_approval: required

  - slug: assets
    skill: pipelines/music-video/asset-director.md
    produces: asset_manifest
    tools_available: [image_generation, image_to_video]
    sample_mode_supported: true
    estimated_cost:
      sample: { usd: 1, comment: "1-2 hero clips + 4-6 images" }
      full: { usd: 5, comment: "8-12 hero clips + 30-40 images" }
    human_approval: optional

  - slug: edit
    skill: pipelines/music-video/edit-director.md
    produces: edit_decisions
    tools_available: []
    human_approval: optional

  - slug: compose
    skill: pipelines/music-video/compose-director.md
    produces: render_report
    tools_available: [video_compose]
    requires_runtime: hyperframes        # or "any"
    human_approval: optional

export:
  supported_targets: [capcut, premiere, davinci, edl]
  default_target: capcut
  notes: |
    edit_decisions + cuesheet contain everything needed for NLE export.
    Asset paths are absolute on disk; cuesheet supplies word-level caption timing.
```

## Stage attributes

| Field | Meaning |
|---|---|
| `slug` | Stage identifier (used in CLI `--from`, `--to`, `--only`) |
| `description` | Optional one-line documentation of the stage's intent |
| `skill` | Path to the Markdown director skill the agent reads before executing the stage |
| `produces` | Primary canonical artifact this stage outputs (validated against `schemas/artifacts/<name>.schema.json`) |
| `produces_artifacts` | Full output artifact list when a source manifest emits multiple artifacts |
| `required_artifacts_in` | Artifacts that must exist before the stage can run |
| `optional_artifacts_in` | Artifacts the stage may use when present |
| `required_tools` | Registry tool names or capability markers that are required for the stage |
| `optional_tools` | Registry tool names or capability markers that improve the stage but are not blockers |
| `tools_available` | Full list of registry tool names or capability markers the stage may use |
| `review_focus` | Reviewer hints — what to scrutinize |
| `success_criteria` | Predicates on the produced artifact |
| `human_approval` | `required` (always prompt) / `optional` (prompt in interactive, skip in non-interactive) / `never` |
| `human_approval_default` | Source-compatible boolean default preserved from migrated manifests; `human_approval` is the normalized Show Sidekick policy |
| `checkpoint_required` | Whether the source pipeline requires a checkpoint at this stage |
| `audio_sync` | `build` (build the cuesheet here) / `required` (must exist before this stage) / `none` |
| `sample_mode_supported` | Whether `--sample` is honored at this stage |
| `estimated_cost` | `{ sample: { usd, comment }, full: { usd, comment } }` — used for proposal-time summaries |
| `requires_runtime` | Forces a specific render runtime (compose stages only) |

## Stage list

Canonical stages and their relative order:

```
research → idea → proposal → script → capture → cuesheet → character_design → rig_plan → scene_plan → assets → edit → compose → publish
```

Pipelines declare any subset of canonical stages. By default, the relative order of canonical stages they include is fixed. A pipeline may also declare additional stages by listing them in the manifest at the desired position.

Pipelines that must preserve a source-harness order may set `stage_order: manifest`. This is intentionally explicit: the runner follows the manifest order exactly and reviewers can see that the pipeline is opting out of canonical sorting. Daily-news uses this to keep the `capture` before `script` flow, so narration is written against real source screenshots and capture failures.

Examples:

- `music-video`: `idea → proposal → script → cuesheet → scene_plan → assets → edit → compose`
- `documentary-montage`: `idea → scene_plan → assets → edit → compose` (skips proposal, script, cuesheet)
- `daily-news`: `idea → research → capture → script → scene_plan → assets → edit → compose → publish` (`stage_order: manifest`)
- `character-animation`: `research → proposal → script → character_design → rig_plan → scene_plan → assets → edit → compose → publish`
- `presentation-demo`: `idea → capture → script → cuesheet → scene_plan → assets → edit → compose → publish` (`stage_order: manifest`; deck is ingested before the script so VO can be slide-aware)
- `framework-smoke`: `research → script` (test pipeline; minimal)

`cuesheet` is included only by pipelines with `master_clock: audio | voiceover`.

## `presentation-demo` bundled pipeline contract

`presentation-demo` is a generalized bundled show type for turning user-supplied decks into animated explainer/demo rough cuts. It accepts a local PDF, PowerPoint `.ppt`, PowerPoint `.pptx`, or direct downloadable deck URL as the required `deck_source` episode input. Optional episode inputs are operator notes, voice preference, duration, and aspect. Authenticated Google Slides, Google Drive, Microsoft 365, OneDrive, and SharePoint sharing links are unsupported in v1 unless the operator exports a downloadable PDF or PowerPoint file first.

The canonical deck artifact is `deck_manifest`, not `capture_manifest`. `deck_manifest` owns source provenance, normalized project-local working file paths, file type, hash, byte size, stable slide IDs, slide order, slide screenshot paths, dimensions, extracted text, speaker notes, extraction engines, and warnings. `capture_manifest` may still be produced later as a compatibility bridge for screenshot-oriented tools by reusing the deck slide ID as `story_id`, but it is not the deck source of truth.

The stage order is manifest-defined:

```
idea → capture → script → cuesheet → scene_plan → assets → edit → compose → publish
```

The human approval gates are:

- `idea`: required before deck ingestion, so source limitations and the animated-demo promise are explicit.
- `script`: required before any TTS, paid narration, or voiceover timing work.
- `compose`: required before publish, because the rendered output must be reviewed as an animated explainer/demo and not accepted as static slide playback.

`master_clock: voiceover` is mandatory. The script carries slide-aware `slide_ids` and `vo_source` per section; the cuesheet turns approved narration into the timing grid and may carry `slide_ids` on scene anchors. Scene planning and edit decisions snap visuals to VO timing rather than slide count.

Export targets are Premiere, DaVinci, CapCut, and EDL. The export package must include `deck_manifest`, slide screenshots, narration, captions when available, edit decisions, render report, and NLE handoff files. A `presentation-demo` output is an animated explainer/demo video; static slideshow export is a failed compose outcome.

## Validation rules

The manifest schema enforces these structural rules:

- **At most one stage may declare `audio_sync: build`** per manifest. Multiple `build` stages are undefined behavior and are rejected at load time.
- **`audio_sync: required` may not precede any `audio_sync: build` stage** in the declared order.
- **`requires_runtime` is valid only on the `compose` stage.**
- **Stage slugs are unique** within a manifest.
- **Canonical stages declared by the manifest must follow the canonical relative order unless `stage_order: manifest` is explicit.** Additional (non-canonical) stages may sit between any two canonical stages.

## Tool-name compatibility

Migrated manifests may preserve source-harness tool names when those names are part of the pipeline contract. Show Sidekick registers compatibility names such as `scene_detect`, `tts_selector`, `image_selector`, `video_selector`, `web_search`, and `hyperframes_compose` so manifests do not silently drift from their source semantics. Selector entries are registry markers: concrete execution still routes through `registry.select(<capability>)` or a provider-specific tool.

## `metadata` block (open passthrough)

The manifest may include a top-level `metadata: { ... }` map with arbitrary keys. The harness does not interpret `metadata` — it is consumed by the pipeline's director skills and by show-level overlays (e.g. brand-specific defaults from a show). Use cases: brand identity (logo path, BRAND_GUIDE reference), content-mode enums (e.g. sourced vs source-free for news-song), pipeline-specific defaults that don't fit standard fields.

`metadata` is `z.record(z.string(), z.unknown())` with passthrough semantics — extra keys do not trip strict-mode rejection.

## `orchestration` block (per-pipeline limits)

Each pipeline may declare per-pipeline orchestration limits:

```yaml
orchestration:
  mode: executive-producer             # explicit orchestration style
  skill: pipelines/music-video/executive-producer.md
  budget_default_usd: 6.00            # used when episode does not override
  cost_drift_threshold: 1.3            # critical reviewer finding when actual > threshold * estimate
  max_revisions_per_stage: 3          # reviewer rounds before pass_with_warnings
  max_send_backs: 3                   # total stage send-backs per run
  max_wall_time_minutes: 60           # hard ceiling
```

Defaults (when omitted): `budget_default_usd: 3.00, cost_drift_threshold: 1.3, max_revisions_per_stage: 2, max_send_backs: 3, max_wall_time_minutes: 30`. If `mode: executive-producer` is present, `skill` must point to the EP skill explicitly; the runner should not guess. Daily-news, for example, runs with `max_revisions_per_stage: 2` and `max_send_backs: 1` to keep cadence tight.

## `sample` block (per-pipeline sample scope)

```yaml
sample:
  duration_s_min: 10                  # shortest acceptable sample
  duration_s_max: 18                  # longest acceptable sample
  max_scenes: 3                       # sample-scoped scene cap
  max_cost_usd: 1.00                  # sample-scoped paid-provider ceiling
  hint: "Intro + first verse, or hook + climax-adjacent beat"
```

Sample scope varies by pipeline: music-video samples are 10-18s (intro + first 4 verse lines); news-song samples 15-20s (no-caption PS2 preview); cinematic samples 10-15s (hook + one motion beat).

`sample_support` declares how `showkick build <show>/<episode> --sample` may run:

- `zero-key`: deterministic local starter sample, no provider credentials.
- `paid`: provider-backed sample through the Runner using a configured provider profile.
- `both`: either zero-key by default or paid when a provider profile is selected.
- `unsupported`: the CLI refuses sample mode with a `sample_unsupported` event and a useful message.

Paid samples still run stage-by-stage through the Runner. Provider calls use registry tools, costs are recorded in `cost-log.json`, decisions are recorded in `decisions.json`, and failed provider stages write failed checkpoints that can be inspected before a retry.

## Artifact JSON schemas

Bundled artifact schemas are generated into `bundled/schemas/artifacts/*.schema.json` from `src/artifacts/json-schema.ts`. When adding or renaming a canonical artifact, update the schema map and run:

```bash
pnpm generate:schemas
```

Director skills may cite `schemas/artifacts/<artifact>.schema.json`; those references must resolve for every artifact listed in `produces` or `produces_artifacts`.

## The harness runtime

```ts
// src/harness/runner.ts (sketch)

export interface RunOptions {
  show: string;
  episode: string;
  sample?: boolean;
  from?: string;
  to?: string;
  only?: string;
  budgetUsd?: number;
  interactive?: boolean;     // default true
}

export class Runner {
  async run(opts: RunOptions): Promise<RunResult> {
    const ctx = await this.loadContext(opts);   // show + episode + pipeline + playbook merged
    const stages = this.planStages(ctx, opts);

    for (const stage of stages) {
      const result = await this.runStage(stage, ctx);
      await this.checkpoint(stage, result, ctx);

      if (this.needsApproval(stage, ctx)) {
        const decision = await this.requestApproval(stage, result, ctx);
        if (decision === 'revise') { /* loop stage */ continue; }
        if (decision === 'abort')  return { status: 'aborted', last_stage: stage.slug };
      }
    }

    return { status: 'completed', artifacts: ctx.artifacts };
  }
}
```

Behaviors:

- Stage transitions are deterministic: load → run → checkpoint → check approval → advance.
- Stages call the agent through a strict interface — agent gets the full context (brief, prior artifacts, registry summary, cuesheet if relevant) and returns the canonical artifact.
- Checkpoints write `projects/<show>/<episode>/state.json` and `projects/<show>/<episode>/checkpoints/<stage>.json`.
- Human approval is an inline prompt in interactive mode; in `--non-interactive`, the harness exits with `awaiting_human` and waits for `showkick approve` or `showkick revise`.
- Sample mode is a flag threaded into the stage context; stages honoring `sample_mode_supported: true` reduce scope, asset counts, and cost.
- The runner ensures `audio_sync: build` stages complete before any `audio_sync: required` stage runs.

## Proposal-time cost summary

When approving the proposal, the harness aggregates `estimated_cost` across cost-incurring stages and shows both sample and full totals. Real costs from the cost tracker overrule estimates as the run progresses.

## Reviewer pass

Each stage runs a self-review against `review_focus` and `success_criteria` before checkpointing. The reviewer is advisory — it surfaces findings but does not block progression. Maximum two review loops per stage; after that, the run proceeds with findings recorded.
