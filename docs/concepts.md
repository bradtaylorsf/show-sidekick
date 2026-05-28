# Concepts

Show Sidekick is a show-first video harness. The CLI gives agents a repeatable project structure, production rules, provider registry, and editor handoff path.

## Project

A project is the folder where `showkick init` ran. Run Show Sidekick commands from inside this folder.

The project owns:

- `AGENTS.md` and `CLAUDE.md` agent instructions.
- `.show-sidekick/` bundled cache of pipelines, playbooks, skills, starters, tools, and docs.
- `shows/` for your editable shows and episodes.
- `inputs/` for local source PDFs, decks, audio, video, images, and folders copied into episodes.
- `projects/` for generated workspaces, checkpoints, renders, cost logs, and decisions.
- `exports/` for Premiere, DaVinci, CapCut, and EDL handoff packages.
- `.env` for local provider keys. This file is gitignored.

## Show

A show is a reusable video series or channel identity. It lives at `shows/<show>/show.yaml`.

A show defines brand, characters, default language, export defaults, ingest rules, and the pipelines that show can use. Examples: a product demo series, a daily news brief, a music-video channel, a documentary series, or an internal training show.

Create one with:

```bash
showkick new show product-launch --from product-demo
```

## Episode

An episode is one concrete video output. It lives at `shows/<show>/episodes/<episode>.yaml`.

Build and export commands target episodes as `show/episode`:

```bash
showkick build product-launch/sample-episode --sample
showkick export product-launch/sample-episode --target premiere
```

If you already have a source file or folder, create the episode from it:

```bash
showkick new episode product-launch investor-update --from ~/Desktop/update-deck.pdf
```

Show Sidekick copies the source into `inputs/<show>/<episode>/` and writes the matching input path into the episode YAML. Use this for one-off PDFs, PowerPoints, audio files, speech recordings, videos, images, or inspiration folders. Use `showkick import` and `showkick watch` for recurring drop zones declared in a show's `ingest.watch[]`.

## Pipeline

A pipeline is the production workflow. It says which stages run, what artifacts each stage produces, what timing clock is used, which director skills guide the agent, and which tools are expected.

Bundled pipeline examples include `animated-explainer`, `music-video`, `news-song`, `screen-demo`, `cinematic`, `documentary-montage`, `talking-head`, `clip-factory`, and `localization-dub`.

Create a project-local pipeline with:

```bash
showkick new pipeline investor-update
```

## Playbook

A playbook is the creative treatment layered onto a pipeline: visual language, typography, motion style, audio rules, overlay style, and quality rules.

Create one with:

```bash
showkick new playbook clean-launch-demo
```

## Starter

A starter is a complete example show with `show.yaml`, a sample episode, brand/character folders, and fixture-backed inputs. Starters are the fastest way to begin.

List starters with:

```bash
showkick ls starters
```

Clone one into a new show with:

```bash
showkick new show first-video --from animated-explainer
```

## Tools

Tools are local or provider capabilities the harness can call: FFmpeg, renderers, image generation, TTS, music generation, video generation, transcription, stock search, hosting, analysis, and review helpers.

Inspect tools with:

```bash
showkick ls tools
showkick tools openai_image
showkick doctor --profile paid-demo
```

## Decisions

Decisions are the audit log for meaningful production choices: provider, model, runtime, budget, approvals, substitutions, and human review outcomes.

Inspect decisions with:

```bash
showkick ls decisions <show>/<episode>
```

When a stage needs approval, use:

```bash
showkick approve <show>/<episode>
showkick revise <show>/<episode> "Make the hook clearer and reduce text density."
```

## Checkpoints And Artifacts

Each stage writes checkpointed artifacts under `projects/<show>/<episode>/`: briefs, scripts, scene plans, asset manifests, edit decisions, render reports, reviews, cost logs, and final renders.

Resume from checkpoints with:

```bash
showkick status <show>/<episode>
showkick resume <show>/<episode>
```

## Provider Profile

A provider profile is a named readiness lane. `paid-demo` checks the paid tools used by the richer sample paths.

```bash
showkick doctor --profile paid-demo
```

Provider profiles do not store credentials. Keys live in your shell or local `.env`.

## Command Map

| Command | What it is for |
|---|---|
| `showkick init` | Scaffold a project in the current folder. |
| `showkick doctor` | Check local project, provider, and tool readiness. |
| `showkick new show` | Create a show, optionally from a starter. |
| `showkick new episode` | Add an episode to a show, optionally from a source file or folder. |
| `showkick new pipeline` | Create a project-local pipeline and director skills. |
| `showkick new playbook` | Create a project-local style playbook. |
| `showkick build` | Run a pipeline for one episode. |
| `showkick cuesheet` | Build/cache audio timing artifacts. |
| `showkick status` | Show current state, cost, and last decision. |
| `showkick approve` | Continue past a human approval checkpoint. |
| `showkick revise` | Send a stage back around with feedback. |
| `showkick resume` | Resume from the next unfinished checkpoint. |
| `showkick ls` | List shows, episodes, pipelines, playbooks, starters, tools, or decisions. |
| `showkick show` | Dump episode state. |
| `showkick export` | Create an editor handoff. |
| `showkick import` | Scaffold an episode from a dropped media folder. |
| `showkick watch` | Detect watched media drops and suggest imports. |
| `showkick setup` | Run tool setup or runtime installation. |
| `showkick tools` | Show details for one tool. |
| `showkick update` | Refresh the local `.show-sidekick/` bundled cache. |
