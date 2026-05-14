# 05 — Pipelines and Harness Runtime

## Where pipelines live

Pipelines are bundled with the harness and cached locally inside the user project at `.predit/pipelines/`. Users may override any pipeline by placing a same-named file at `<project>/pipelines/<slug>.yaml` — the resolver checks the local path first, then falls back to the cache. See [`10-installation-and-user-projects.md`](10-installation-and-user-projects.md).

A pipeline is *referenced* from a show via the `show.pipelines: { <name>: { ... } }` map (see [`04-shows-and-episodes.md`](04-shows-and-episodes.md) → "Pipeline binding"). A show may reference multiple pipelines. The harness rejects an episode that names a pipeline the show doesn't declare in its `pipelines` map.

## Manifest schema

Pipelines are declarative YAML manifests at `pipelines/<slug>.yaml` (or the bundled equivalent in `.predit/pipelines/<slug>.yaml`). They describe the workflow; how-to lives in stage director skills (Markdown).

```yaml
slug: music-video
display_name: "Music Video"
description: "Vertical music videos for AI-generated music tracks"
status: production                       # production | beta | experimental
master_clock: audio                      # audio | voiceover | none

defaults:
  aspect: "9:16"
  duration_strategy: track_length        # track_length | brief | custom
  max_scene_duration_s: 5
  render_runtime: hyperframes

stages:
  - slug: idea
    skill: pipelines/music-video/idea-director.md
    produces: brief
    tools_available: [research, web_search]
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
| `produces` | Canonical artifact this stage outputs (validated against `schemas/artifacts/<name>.schema.json`) |
| `tools_available` | Capability names the stage may use; resolved via the registry |
| `review_focus` | Reviewer hints — what to scrutinize |
| `success_criteria` | Predicates on the produced artifact |
| `human_approval` | `required` (always prompt) / `optional` (prompt in interactive, skip in non-interactive) / `never` |
| `audio_sync` | `build` (build the cuesheet here) / `required` (must exist before this stage) / `none` |
| `sample_mode_supported` | Whether `--sample` is honored at this stage |
| `estimated_cost` | `{ sample: { usd, comment }, full: { usd, comment } }` — used for proposal-time summaries |
| `requires_runtime` | Forces a specific render runtime (compose stages only) |

## Stage list

Canonical stages and their relative order:

```
research → idea → proposal → script → capture → cuesheet → character_design → rig_plan → scene_plan → assets → edit → compose → publish
```

Pipelines declare any subset of canonical stages; the relative order of canonical stages they include is fixed. A pipeline may also declare additional stages by listing them in the manifest at the desired position. Examples:

- `music-video`: `idea → proposal → script → cuesheet → scene_plan → assets → edit → compose`
- `documentary-montage`: `idea → scene_plan → assets → edit → compose` (skips proposal, script, cuesheet)
- `daily-news`: `research → idea → script → capture → scene_plan → assets → edit → compose → publish`
- `character-animation`: `research → proposal → script → character_design → rig_plan → scene_plan → assets → edit → compose → publish`
- `framework-smoke`: `research → script` (test pipeline; minimal)

`cuesheet` is included only by pipelines with `master_clock: audio | voiceover`.

## Validation rules

The manifest schema enforces these structural rules:

- **At most one stage may declare `audio_sync: build`** per manifest. Multiple `build` stages are undefined behavior and are rejected at load time.
- **`audio_sync: required` may not precede any `audio_sync: build` stage** in the declared order.
- **`requires_runtime` is valid only on the `compose` stage.**
- **Stage slugs are unique** within a manifest.
- **Canonical stages declared by the manifest must follow the canonical relative order.** Additional (non-canonical) stages may sit between any two canonical stages.

## `metadata` block (open passthrough)

The manifest may include a top-level `metadata: { ... }` map with arbitrary keys. The harness does not interpret `metadata` — it is consumed by the pipeline's director skills and by show-level overlays (e.g. brand-specific defaults from a show). Use cases: brand identity (logo path, BRAND_GUIDE reference), content-mode enums (e.g. sourced vs source-free for news-song), pipeline-specific defaults that don't fit standard fields.

`metadata` is `z.record(z.string(), z.unknown())` with passthrough semantics — extra keys do not trip strict-mode rejection.

## `orchestration` block (per-pipeline limits)

Each pipeline may declare per-pipeline orchestration limits:

```yaml
orchestration:
  budget_default_usd: 6.00            # used when episode does not override
  max_revisions_per_stage: 3          # reviewer rounds before pass_with_warnings
  max_send_backs: 3                   # total stage send-backs per run
  max_wall_time_minutes: 60           # hard ceiling
```

Defaults (when omitted): `budget_default_usd: 3.00, max_revisions_per_stage: 2, max_send_backs: 3, max_wall_time_minutes: 30`. Daily-news, for example, runs with `max_revisions_per_stage: 2` and `max_send_backs: 1` to keep cadence tight.

## `sample` block (per-pipeline sample scope)

```yaml
sample:
  duration_s_min: 10                  # shortest acceptable sample
  duration_s_max: 18                  # longest acceptable sample
  hint: "Intro + first verse, or hook + climax-adjacent beat"
```

Sample scope varies by pipeline: music-video samples are 10-18s (intro + first 4 verse lines); news-song samples 15-20s (no-caption PS2 preview); cinematic samples 10-15s (hook + one motion beat).

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
- Human approval is an inline prompt in interactive mode; in `--non-interactive`, the harness exits with `awaiting_human` and waits for `predit approve` or `predit revise`.
- Sample mode is a flag threaded into the stage context; stages honoring `sample_mode_supported: true` reduce scope, asset counts, and cost.
- The runner ensures `audio_sync: build` stages complete before any `audio_sync: required` stage runs.

## Proposal-time cost summary

When approving the proposal, the harness aggregates `estimated_cost` across cost-incurring stages and shows both sample and full totals. Real costs from the cost tracker overrule estimates as the run progresses.

## Reviewer pass

Each stage runs a self-review against `review_focus` and `success_criteria` before checkpointing. The reviewer is advisory — it surfaces findings but does not block progression. Maximum two review loops per stage; after that, the run proceeds with findings recorded.
