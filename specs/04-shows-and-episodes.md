# 04 — Shows and Episodes

## Where shows live

Shows live in the **user project**, not in the harness. Paths in this spec are relative to the user project root (the folder where `showkick init` ran). The harness ships starter shows in its bundled cache; users clone them into their project via `showkick new show <slug> --from <starter>`. See [`10-installation-and-user-projects.md`](10-installation-and-user-projects.md).

> **Multi-pipeline shows.** Each show declares the *set* of pipelines it uses via `show.pipelines: { <name>: { ... } }`. A show is the brand/channel/identity; pipelines under it are the technical workflows that identity runs. A YouTube channel that publishes news raps and evergreen songs, or a consulting brand that publishes product demos and spokesperson videos, is one show with two pipelines — not two shows.

## Shows are first-class

`shows/` is the API of Show Sidekick. A show is the **brand/channel/identity** layer — it owns the recurring elements that persist across episodes and across pipelines. Each show owns:

- the brand (logo, palette, typography, voice)
- the recurring cast (characters)
- the **set of pipelines** the show uses (a show is not coupled to a single pipeline)
- per-pipeline defaults (playbook, runtime, aspect, budget)
- per-pipeline playbook overrides
- skill overrides
- ingest rules (what drop zone produces what kind of episode, routed to which pipeline)
- export defaults

The harness layer knows nothing show-specific — it loads a show and runs episodes against the show's declared pipelines.

A YouTube channel, podcast feed, or branded series typically maps to one show, even when that brand publishes multiple formats (news + evergreen songs; demos + spokesperson videos). The show is the durable identity; pipelines are the workflows that identity runs.

## Directory layout

```
shows/<show-slug>/
├── show.yaml                          # the manifest
├── README.md                          # human-readable description
├── brand/                             # logo, palette, typography, voice
├── characters/<name>/                 # voice_id, visual desc, references
├── pipelines/                         # optional: per-pipeline playbook overrides + show-specific skill overrides
│   └── <pipeline>.playbook-overrides.yaml
├── skills/                            # optional show-wide skill overrides (apply across all pipelines)
└── episodes/<slug>.yaml               # one episode = one rendered output
```

## `show.yaml`

```yaml
slug: news-music-studio
display_name: "News Music Studio"
description: "Sourced news songs plus evergreen beat-synced music videos"
created: 2026-05-12

# Show-owned content — paths relative to show.yaml.
brand: ./brand/
characters: ./characters/
skills: ./skills/

# Pipelines this show uses. Each entry declares pipeline-specific defaults
# (playbook, runtime, aspect, budget) that override the bundled pipeline's
# defaults and layer under the playbook's defaults. Episode picks one of these
# pipelines by name.
pipelines:
  news-song:                              # recurring sourced news-song episodes
    playbook: ps2-dystopian-news-rap
    runtime: hyperframes
    aspect: "16:9"
    budget_usd: 6
    provider_profile: paid-demo           # optional paid-provider default for this pipeline
    playbook_overrides: ./pipelines/news-song.playbook-overrides.yaml
  music-video:                            # evergreen beat-synced songs
    playbook: beat-synced-lyric-video
    runtime: hyperframes
    aspect: "16:9"
    budget_usd: 5

# Default pipeline when an episode doesn't pick one. Must be a key in `pipelines`.
defaults:
  pipeline: news-song
  language: en
  provider_profile: paid-demo             # optional show-wide provider default

# Ingest: what Show Sidekick watches, and how a drop becomes an episode.
# Each watch entry routes to a specific pipeline within this show.
ingest:
  episode_template: ./episode.template.yaml
  watch:
    - path: ../../music_library/news-music-studio-news
      match: "**/track.mp3"
      pipeline: news-song
      slug_from: parent_dir              # parent_dir | filename | prompt
    - path: ../../music_library/news-music-studio-songs
      match: "**/track.mp3"
      pipeline: music-video
      slug_from: parent_dir

# Export defaults
export:
  default_target: capcut
  asset_link_mode: copy                  # copy | symlink | reference
```

Ingest `path` values resolve relative to `shows/<show>/`. A drop matches when the dropped file, or a file inside the dropped folder, lives under that watch path and satisfies `match`. The built-in matcher supports the common starter pattern `**/literal.ext` and exact `*` segment wildcards; matches are anchored, so `**/track.mp3` does not match `track.mp3.bak`.

When `slug_from` is `parent_dir`, watch suggestions derive the episode slug from the matched file's parent folder. `filename` derives it from the matched file basename. `prompt` requires a human-supplied slug and is rejected by non-interactive ingest.

`showkick import` uses the episode slug from `--as`, the matched watch entry's `pipeline`, and sibling files next to the matched file to populate `inputs`. Audio files become `track`, `.txt` becomes `lyrics`, `.yaml` / `.yml` becomes `sources`, video files become `reference`, and other files become `source`.

A single-pipeline show is just a `pipelines:` map with one entry. The model degrades cleanly to "one workflow per show" when that's all the show needs.

## `episode.yaml`

```yaml
slug: 2026-05-12-news-jam
title: "Bi-weekly News Jam — May 12"
created: 2026-05-12

# Picks one of the pipelines declared on the show. MUST be a key in show.pipelines.
# If omitted, defaults to show.defaults.pipeline.
pipeline: news-song

# Overrides on top of show.pipelines[<pipeline>].* defaults. Anything omitted
# falls back to the per-pipeline defaults, then to the bundled pipeline defaults.
playbook: ps2-dystopian-news-rap
runtime: hyperframes
aspect: "16:9"
budget_usd: 6
provider_profile: paid-demo

# Inputs the pipeline needs.
inputs:
  track: music_library/news-music-studio-news/2026-05-12-news-jam/track.mp3
  reference: music_library/news-music-studio-news/reference-video.mp4
  lyrics: music_library/news-music-studio-news/2026-05-12-news-jam/lyrics.txt
  sources: music_library/news-music-studio-news/2026-05-12-news-jam/sources.yaml
  notes: |
    Hook hits at 0:18. Two evidence beats around 0:42 and 1:55.

# Characters used in this episode — slugs resolve via show's characters/ dir.
cast: [host-mc, ambient-crowd]

# Tags help filtering/listing.
tags: [news-song, ps2, political-rap]
```

`inputs.reference` is optional. When present, `showkick build` treats it the same as `--reference`: a URL is parsed with `new URL()`, while local paths resolve against cwd and then `<project>/music_library/`. The resulting `video_analysis_brief` is saved under `projects/<show>/<episode>/artifacts/` and supplied to downstream stages and reviewer checks. Reference analysis happens before pipeline selection; when `episode.pipeline` is omitted, the brief can steer the run from the show default to a declared reference-capable pipeline. An explicit `episode.pipeline` remains authoritative.

## Resolution order

When the harness loads an episode, it merges configuration in this order (later wins):

1. **Resolve reference input, if any.** `--reference` wins over `inputs.reference`. The reference analyst writes `video_analysis_brief` before pipeline selection so it can inform routing.
2. **Resolve the pipeline.** `episode.pipeline` (if set), else a reference-capable pipeline hinted by `video_analysis_brief`, else `show.defaults.pipeline`. The resolved name MUST be a key in `show.pipelines`; otherwise the harness fails with a structured error.
3. **Load the pipeline manifest.** `pipelines/<pipeline>.yaml` (project-local override) or `.show-sidekick/pipelines/<pipeline>.yaml` (bundled). Provides workflow, stages, tools available, success criteria.
4. **Resolve the playbook.** `episode.playbook` > `show.pipelines[<pipeline>].playbook`. Load `playbooks/<playbook>.yaml` (project-local) or `.show-sidekick/playbooks/<playbook>.yaml` (bundled).
5. **Apply per-pipeline playbook overrides.** `show.pipelines[<pipeline>].playbook_overrides` is deep-merged on top of the playbook.
6. **Apply per-pipeline defaults.** `show.pipelines[<pipeline>]` defaults (runtime, aspect, budget, provider profile) deep-merge on top of the pipeline manifest's defaults.
7. **Apply episode overrides.** `episode.*` deep-merges on top of the merged result. For paid sample routing, provider profile precedence is CLI `--provider-profile` > `episode.provider_profile` > `show.pipelines[<pipeline>].provider_profile` > `show.defaults.provider_profile`.
8. **Resolve characters.** `episode.cast[]` → `shows/<show>/characters/<slug>/`.
9. **Resolve skills** (first match wins):
   - show-level: `shows/<show>/skills/<stage>-director.md`
   - project-local: `skills/pipelines/<pipeline>/<stage>-director.md`
   - bundled default: `.show-sidekick/skills/pipelines/<pipeline>/<stage>-director.md`
9. **Resolve tools per stage** via the registry.

## Deep-merge semantics

- Objects merge by key.
- Arrays replace (not concatenate) — explicit and predictable.
- `null` removes the key from the merged result.

## Runtime state

Runtime state (current stage, last checkpoint, costs, decisions) lives in `projects/<show>/<episode>/state.json` and is gitignored. `episode.yaml` stays authored-intent only.

## Pipeline binding (multi-pipeline shows)

A show declares the pipelines it uses in `show.pipelines: { <name>: { ... } }`. Each entry maps a pipeline name to its per-pipeline defaults (playbook, runtime, aspect, budget, playbook_overrides) and pipeline-specific mode flags such as `capture_mode`. The show owns brand, characters, and skills; the pipelines under it are the technical workflows that identity runs.

**Validation rules:**

- `show.pipelines` MUST be a non-empty map. A show with no pipelines is invalid.
- `show.defaults.pipeline` MUST be a key in `show.pipelines`.
- `episode.pipeline` (when set) MUST be a key in `show.pipelines`. The harness rejects episodes that name a pipeline the show doesn't declare.
- Every pipeline name in `show.pipelines` MUST resolve to a real pipeline manifest (bundled or project-local) at load time.

**Why this shape:**

- One show = one brand / channel / identity. Brand assets, characters, voice, and publish destination are owned at the show level.
- Pipelines are technical recipes. A show may use one (a personal music-video series) or several (a YouTube channel that publishes news raps *and* evergreen songs).
- Per-pipeline overrides keep look and runtime defaults co-located with the pipeline they apply to — no ambiguity about which playbook a show-level override should target when the show runs multiple pipelines.

**Worked example:**

```yaml
# A YouTube channel publishing two formats under one brand.
slug: news-music-studio
pipelines:
  news-song:                        # recurring sourced news song
    playbook: ps2-dystopian-news-rap
    aspect: "16:9"
  music-video:                      # evergreen beat-synced songs
    playbook: beat-synced-lyric-video
    aspect: "16:9"
defaults:
  pipeline: news-song
```

```yaml
# A consulting brand publishing demos AND spokesperson videos.
slug: product-studio
pipelines:
  screen-demo:
    playbook: clean-professional
    runtime: remotion
    capture_mode: synthetic_terminal
  talking-head:
    playbook: clean-professional
    runtime: remotion
defaults:
  pipeline: screen-demo
```

```yaml
# A personal music-video series with one workflow.
slug: music-videos
pipelines:
  music-video:
    playbook: playful-hip-hop-explainer
    runtime: hyperframes
    aspect: "9:16"
defaults:
  pipeline: music-video
```
