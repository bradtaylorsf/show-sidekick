# 00 — Overview

## What predit is

A show-first AI pre-production harness for video. The agent reads instructions (pipeline manifests, stage director skills, vendor knowledge skills) and drives the production stage by stage. The output is a rendered rough cut plus an editor handoff (EDL, Premiere XML, or CapCut draft) so a human editor can finish in their NLE of choice.

## The three-layer mental model

| Layer | Owns | Lives in | Reused across |
|---|---|---|---|
| **Show** | A recurring series with a brand, cast, default workflow | `shows/<show>/` | Episodes |
| **Pipeline** | A workflow: stages, tools per stage, approval gates, audio-sync policy | `pipelines/<pipeline>.yaml` + `skills/pipelines/<pipeline>/` | Shows |
| **Playbook** | A look: palette, typography, motion, audio mood | `playbooks/<playbook>.yaml` | Shows / episodes |

The harness loads a show, resolves its pipeline and playbook, then runs episodes through the pipeline. The agent reads the resolved context and director skills to do the creative work at each stage.

## Episode is the unit of work

- One episode = one rendered output.
- Episodes live as `shows/<show>/episodes/<episode>.yaml` — author-intent only.
- Runtime state (current stage, costs, last checkpoint) lives in `projects/<show>/<episode>/` (gitignored).
- Generated media (images, video clips, narration, music, render) also lives under `projects/<show>/<episode>/`.

## Audio is the master clock for music-led content

Music videos, trailers, news-songs — anything where music drives the experience — use audio as the master clock. The audio subsystem detects sections, beats, and climax points; the scene planner snaps scene boundaries to those musical events. The visual cadence never overrides the audio.

For narration-led content (diaries, documentaries, explainers), voiceover is the master clock, and visuals snap to VO sections.

## Pre-production, not full post

`predit`'s job ends at "a rough cut you'd be happy to ship as draft + an editor handoff." A human editor finishes in Premiere, CapCut, or DaVinci. This boundary keeps `predit`'s scope tight and gives the output a credible home in existing professional workflows.

## Harness vs user project

`predit` is installed as a CLI. Users run it inside their own folder — a *user project* that contains only their shows, characters, brand assets, and runtime workspace. The harness ships bundled pipelines, playbooks, skills, schemas, and starter shows; the user project owns the actual content. See [`10-installation-and-user-projects.md`](10-installation-and-user-projects.md) for the resolution rules.

## Layer map

The system has three instruction layers:

1. **Tool layer** (`src/tools/`) — what exists, availability, cost, integration kind.
2. **Pipeline / skill layer** (`pipelines/`, `skills/pipelines/`) — how `predit` wants those tools used in a given workflow.
3. **Vendor knowledge layer** (`skills/agents/`) — provider-specific prompt engineering, parameter tuning.

Reading order for the agent: discover tools → read the relevant pipeline + director skill → read the vendor skill before crafting prompts.
