# Prompt Library

These prompts are meant for Codex, Claude Code, Cursor, or any local coding agent that can read and edit your project folder. They are CLI-backed prompts: the agent still uses `showkick`, but you can ask in plain language.

Use these defaults:

- Ask before installing system dependencies.
- Ask before any paid provider call.
- Run commands from inside the Show Sidekick project folder.
- Read `AGENTS.md` before changing a project.
- Prefer starters and existing pipelines before creating custom ones.

## Set Up A New Project

```text
Help me set up Show Sidekick in a fresh project folder and make my first no-key video.

Ask me what folder name to use. If I do not care, use show-sidekick-first-video. Check Node 22+, npm, Git, FFmpeg, and ffprobe without changing my machine. Also check Python and uv, but treat them as optional tool runtimes, not blockers for the first no-key video.

If a system prerequisite is missing, explain what it is for and ask before installing it. Do not install Python, uv, FFmpeg, Git, Node, npm, Homebrew, winget packages, or provider CLIs without asking first.

Once Node and npm are available, install or update Show Sidekick globally with:
npm install -g show-sidekick@latest

Create the project folder, cd into it, initialize the animated-explainer starter, then build and export the first no-key sample:
showkick init --starter animated-explainer --git
showkick doctor
showkick build animated-explainer/sample-episode --sample
showkick export animated-explainer/sample-episode --target premiere

Before paid work, stop and ask for approval with provider, model or tool, purpose, scope, and rough cost.
```

## Choose The Right Starter

```text
I want to create a new Show Sidekick video project, but I am not sure which starter to use.

Read AGENTS.md if it exists, then list the bundled starters with `showkick ls starters`. Ask me what kind of video I want to make, recommend three starter options, explain the tradeoffs briefly, then create the show from the best starter only after I confirm.
```

## Create A New Show From A Starter

```text
Create a new Show Sidekick show for <purpose>.

First list available starters with `showkick ls starters`. Recommend the best starter and pipeline for my goal. After I confirm, create the show with `showkick new show <show-slug> --from <starter-slug>`. Then open the new `shows/<show-slug>/show.yaml` and summarize what pipeline, playbook, inputs, and sample episode it includes.
```

## Create A New Show Without A Starter

```text
Create a new Show Sidekick show named <show name>.

Ask me what the show makes, who it is for, the default aspect ratio, and which one or two pipelines it should use. Then run `showkick new show <show-slug> --pipelines <pipeline-list>`. Keep the show generalized and editable. After creating it, review `shows/<show-slug>/show.yaml` and tell me what episode inputs I need next.
```

## Add A New Episode

```text
Add a new episode to the <show-slug> show.

Ask me for the episode topic, target length, source inputs, and whether this should be a no-key sample or a paid-provider run. Create it with `showkick new episode <show-slug> <episode-slug> --pipeline <pipeline>`. Then edit the episode YAML to include only the inputs that pipeline needs. Do not run paid tools until I approve.
```

## Add An Episode From A Source File

```text
Create a Show Sidekick episode from this source: <path>.

Inspect the target show and choose the best pipeline it already declares. If the show does not exist, recommend a starter or pipeline first. Then run `showkick new episode <show-slug> <episode-slug> --from <path> --pipeline <pipeline>` if a pipeline override is needed. Confirm that the source was copied into `inputs/<show>/<episode>/`, summarize the inferred inputs, and do not run paid tools until I approve.
```

## Build A Sample

```text
Build a short sample for <show>/<episode>.

Read the show, episode, pipeline, and playbook. Run `showkick doctor` first. If the sample can run with no provider credits, run `showkick build <show>/<episode> --sample`. If paid providers are needed, stop and ask me for approval with expected provider, model or tool, purpose, and rough cost.
```

## Build A Full Episode

```text
Build the full episode <show>/<episode>.

Inspect status and decisions first with `showkick status <show>/<episode>` and `showkick ls decisions <show>/<episode>`. Explain the planned pipeline stages, provider choices, runtime, budget, and likely cost. Wait for my approval before running `showkick build <show>/<episode>`.
```

## Export An Editor Handoff

```text
Export <show>/<episode> for editing.

Check whether a completed render and edit decisions exist. Recommend Premiere, DaVinci, CapCut, or EDL based on my editor. Then run the matching `showkick export <show>/<episode>` command. If an export already exists, ask before using `--overwrite`.
```

## Create A New Pipeline

```text
Create a new Show Sidekick pipeline for <workflow>.

First inspect existing pipelines with `showkick ls pipelines` and explain whether one can already handle this. If a new pipeline is justified, ask me for the master clock, expected inputs, stages, output artifacts, runtime, provider profile, sample support, and compatible playbooks. Then run `showkick new pipeline <pipeline-slug>`, edit the manifest and director skills, and add/update docs or tests that lock the new behavior.
```

## Create A New Playbook

```text
Create a new Show Sidekick playbook for <style/treatment>.

Inspect compatible playbooks for the target pipeline. Ask me for visual language, typography, motion style, audio treatment, color rules, overlays, and quality rules. Then run `showkick new playbook <playbook-slug>` and edit it into a reusable style treatment. Keep it generic enough for more than one show unless I explicitly ask for a show-specific override.
```

## Customize A Starter Show

```text
Customize the <show-slug> starter into my own show.

Read `shows/<show-slug>/show.yaml`, the sample episode, brand folder, character template, and README. Ask me for the show name, audience, tone, brand constraints, and recurring formats. Update only project-local files under `shows/<show-slug>/`. Do not edit `.show-sidekick/` bundled cache files.
```

## Inspect Tools And Provider Readiness

```text
Help me understand which Show Sidekick tools are available.

Run `showkick doctor --profile paid-demo`, `showkick ls tools --json`, and inspect any relevant provider docs. Summarize what is available now, what is missing, which missing items are optional, and what would spend money. Ask before installing provider CLIs or using paid APIs.
```

## List Project Inventory

```text
Show me what is in this Show Sidekick project.

Run the relevant `showkick ls` commands for shows, starters, pipelines, playbooks, and tools. If I name a show, also list its episodes with `showkick ls episodes <show>`. Summarize the useful choices and recommend the next action.
```

## Dump Episode State

```text
Explain the current state of <show>/<episode>.

Run `showkick show <show>/<episode>` and `showkick status <show>/<episode>`. Summarize the episode inputs, selected pipeline, latest artifacts, current status, and anything blocking the next build or export.
```

## Build Or Refresh A Cuesheet

```text
Build the audio timing cuesheet for <show>/<episode>.

Inspect the episode inputs first and confirm it has a track or completed voiceover artifacts. Then run `showkick cuesheet <show>/<episode>`. Summarize the cuesheet, lyric alignment, audio energy, and any timing warnings before the next build step.
```

## Set Up Runtimes

```text
Set up local Show Sidekick runtimes for this project.

Run `showkick doctor` and inspect whether Remotion, HyperFrames, FFmpeg, and ffprobe are available. Explain what `showkick setup runtimes` will install locally in this project. Ask for approval before running setup or installing any system dependency.
```

## Review Decisions And Continue

```text
Review the current state of <show>/<episode>.

Run `showkick status <show>/<episode>` and `showkick ls decisions <show>/<episode>`. Explain the latest decision, any awaiting approval, current cost, and next safe action. If approval is needed, show me the exact choice and wait for my instruction before running `showkick approve` or `showkick revise`.
```

## Revise A Stage

```text
Revise <show>/<episode> based on this note: <revision note>.

Inspect the current checkpoint and decision log. Then run `showkick revise <show>/<episode> "<revision note>"`. Resume only after explaining which stage will rerun and whether any provider call might spend credits.
```

## Resume Work

```text
Resume <show>/<episode>.

Run `showkick status <show>/<episode>` first. If it is safe to continue without paid work, run `showkick resume <show>/<episode>`. If the next step may spend credits or changes provider/runtime/model choices, ask before continuing.
```

## Import A Media Drop

```text
Turn this folder into a Show Sidekick episode: <path>.

Inspect the folder contents and the project's ingest rules. If this is a one-off source folder, prefer `showkick new episode <show> <episode> --from <path>`. If the show has a recurring `ingest.watch[]` rule that matches the folder, run `showkick import <path> --as <show>/<episode>` only after I confirm. Summarize the episode YAML and missing inputs.
```

## Watch For Drops

```text
Check this Show Sidekick project for watched media drops.

Run `showkick watch`, explain any suggested imports, and ask before creating episodes. If watch rules are missing, inspect `show.yaml` and suggest the smallest ingest rule change.
```

## Update The Bundled Cache

```text
Check whether this Show Sidekick project cache is current.

Run `showkick update --check`. If it is stale, explain what the update refreshes and ask before running `showkick update`. Do not edit `.show-sidekick/` directly.
```
