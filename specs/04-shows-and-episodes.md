# 04 — Shows and Episodes

## Where shows live

Shows live in the **user project**, not in the harness. Paths in this spec are relative to the user project root (the folder where `predit init` ran). The harness ships starter shows in its bundled cache; users clone them into their project via `predit new show <slug> --from <starter>`. See [`10-installation-and-user-projects.md`](10-installation-and-user-projects.md).

## Shows are first-class

`shows/` is the API of `predit`. Each show owns:

- its default pipeline and playbook
- its brand assets (logo, palette, typography)
- its recurring cast (characters)
- its skill overrides
- its ingest rules (what drop zone produces what kind of episode)
- its export defaults

The harness layer knows nothing show-specific — it loads a show and runs episodes.

## Directory layout

```
shows/<show-slug>/
├── show.yaml                          # the manifest
├── README.md                          # human-readable description
├── brand/                             # logo, palette, typography
├── characters/<name>/                 # voice_id, visual desc, references
├── playbook.overrides.yaml            # optional show-level look tweaks
├── skills/                            # optional show-specific skill overrides
└── episodes/<slug>.yaml               # one episode = one rendered output
```

## `show.yaml`

```yaml
slug: music-videos
display_name: "Music Videos"
description: "AI music videos for original Suno tracks"
created: 2026-05-12

# Defaults — every episode inherits these unless it overrides.
defaults:
  pipeline: music-video                # → pipelines/music-video.yaml
  playbook: playful-hip-hop-explainer  # → playbooks/playful-hip-hop-explainer.yaml
  runtime: hyperframes                 # ffmpeg | remotion | hyperframes
  aspect: "9:16"
  language: en
  budget_usd: 5

# Show-owned content — paths relative to show.yaml.
brand: ./brand/
characters: ./characters/
skills: ./skills/
playbook_overrides: ./playbook.overrides.yaml

# Ingest: what predit watches, and how a drop becomes an episode.
ingest:
  episode_template: ./episode.template.yaml
  watch:
    - path: ../../music_library
      match: "**/track.mp3"
      pipeline: music-video
      slug_from: parent_dir            # parent_dir | filename | prompt

# Export defaults
export:
  default_target: capcut
  asset_link_mode: copy                # copy | symlink | reference
```

## `episode.yaml`

```yaml
slug: midnight-train
title: "Midnight Train"
created: 2026-05-12

# Overrides — anything omitted falls back to show.yaml defaults.
pipeline: music-video
playbook: playful-hip-hop-explainer
runtime: hyperframes
aspect: "9:16"
budget_usd: 5

# Inputs the pipeline needs.
inputs:
  track: music_library/midnight-train/track.mp3
  lyrics: music_library/midnight-train/lyrics.txt
  references: []
  notes: |
    Hook hits at 0:18. Three sections.

# Characters used in this episode — slugs resolve via show's characters/ dir.
cast: [rag, agent, graph]

# Tags help filtering/listing.
tags: [music-video, hip-hop, vertical]
```

## Resolution order

When the harness loads an episode, it merges configuration in this order (later wins):

1. Load `pipelines/<pipeline>.yaml` — workflow + tools available per stage.
2. Load `playbooks/<playbook>.yaml` — visual look defaults.
3. Merge `show.yaml.playbook_overrides` on top of the playbook (deep merge).
4. Merge `episode.*` on top of `show.defaults` (deep merge).
5. Resolve characters: `episode.cast[]` → `shows/<show>/characters/<slug>/`.
6. Resolve skills:
   - shared default: `skills/pipelines/<pipeline>/<stage>-director.md`
   - show override (wins if present): `shows/<show>/skills/<stage>-director.md`
7. Resolve tools per stage via the registry.

## Deep-merge semantics

- Objects merge by key.
- Arrays replace (not concatenate) — explicit and predictable.
- `null` removes the key from the merged result.

## Runtime state

Runtime state (current stage, last checkpoint, costs, decisions) lives in `projects/<show>/<episode>/state.json` and is gitignored. `episode.yaml` stays authored-intent only.

## Pipeline binding

- `show.defaults.pipeline` is **required** — a show has a canonical workflow.
- An episode can declare a different `pipeline` when needed (rare).
- The harness validates that the episode's pipeline file exists at load time.
