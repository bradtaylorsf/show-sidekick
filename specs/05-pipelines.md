# 05 — Pipelines and Harness Runtime

## Where pipelines live

Pipelines are bundled with the harness and cached locally inside the user project at `.predit/pipelines/`. Users may override any pipeline by placing a same-named file at `<project>/pipelines/<slug>.yaml` — the resolver checks the local path first, then falls back to the cache. See [`10-installation-and-user-projects.md`](10-installation-and-user-projects.md).

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
    skill: pipelines/music-video/cuesheet-director.md
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

Canonical stage order. Pipelines may include any subset, but the order is fixed:

```
idea → script → cuesheet → scene_plan → assets → edit → compose
```

`cuesheet` is omitted for non-audio pipelines (`master_clock: none`).

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
