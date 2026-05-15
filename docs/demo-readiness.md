# Demo Readiness

This guide is for validating `predit` as a CLI-driven production harness, not for producing videos from inside the harness repo.

## Mental Model

A legacy in-repo production flow is repo-local: clone the repo, run the coding agent inside that repo, and generated projects live under the repo's `projects/` folder.

`predit` is CLI-first: install or build the CLI, create a separate user project, run the coding agent inside that user project, and let the CLI provide the harness. The user project owns shows, episodes, media, and renders. The harness ships pipelines, playbooks, skills, schemas, and starters, then mirrors them into `.predit/` so agents can read them.

```text
predit harness repo                  user project
-------------------                  ------------
src/                                 AGENTS.md
bundled/pipelines/        init       shows/
bundled/skills/        ---------->   music_library/
bundled/starters/                    projects/
dist/cli/index.js                    .predit/   (gitignored cache)
```

Agents should run production commands from the user project. They may read `.predit/`, but they should not edit it by hand. Overrides belong in `pipelines/`, `playbooks/`, `skills/`, or `shows/<show>/skills/`.

## Local CLI Smoke Test

Use this before publishing a package. It verifies the current local build through the same project model a user would see.

```bash
cd /Users/bradtaylor/Documents/GitHub/predit
pnpm install
pnpm build

mkdir -p ~/predit-demo-lab
cd ~/predit-demo-lab

alias predit-dev='node /Users/bradtaylor/Documents/GitHub/predit/dist/cli/index.js'

predit-dev init --starter music-video --git
predit-dev ls pipelines
predit-dev ls starters
predit-dev build music-video/sample-episode --sample
predit-dev export music-video/sample-episode --target premiere
```

The expected outputs are:

- project scaffold: `AGENTS.md`, `CLAUDE.md`, `.predit/`, `shows/`, `music_library/`, `projects/`
- sample render state: `projects/music-video/sample-episode/`
- sample render: `projects/music-video/sample-episode/renders/sample-preview.mp4`
- editor handoff: `exports/music-video__sample-episode.premiere/`

The same sequence has been verified locally with `node dist/cli/index.js` from a temporary user project.

## Provider Setup

The zero-key starter smoke does not need paid providers. The paid demo lane starts with OpenAI, ElevenLabs, Higgsfield, and ffmpeg.

Set credentials in your shell or in a local env file that is not committed:

```bash
export OPENAI_API_KEY="sk-..."
export ELEVENLABS_API_KEY="..."
```

Install and authenticate Higgsfield with its own CLI:

```bash
npm install -g @higgsfield/cli
higgsfield login
higgsfield whoami
```

Then check `predit` availability from inside the user project:

```bash
predit-dev doctor
predit-dev ls tools
predit-dev tools openai_image
predit-dev tools elevenlabs_tts
predit-dev tools higgsfield
```

Credentials stay outside the harness. `predit` should only read environment variables or delegate auth to the vendor CLI.

## Current State

The current green CLI path is the bundled zero-key `music-video` starter:

```bash
predit-dev build music-video/sample-episode --sample
predit-dev export music-video/sample-episode --target premiere
```

The full demo matrix is not ready until Epic 11 lands. Known blockers:

- baseline bundled pipeline manifests are now present, but still need a taxonomy/starter audit
- several starters still point at missing or show-only pipeline names
- `music-video` currently behaves as a zero-key starter pipeline, not the full paid-provider production workflow
- the paid-provider lane needs an explicit preflight/profile for OpenAI, ElevenLabs, and Higgsfield
- compatibility aliases are still needed for legacy tool names

## Target Demo Matrix

Epic 11 makes these formats demoable from a clean user project:

| Pipeline | Demo shape |
|---|---|
| `animated-explainer` | Last Rev-style workflow explainer with narration, generated visuals, captions, and export |
| `animation` | Short animation-first piece using generated images and motion treatment |
| `avatar-spokesperson` | Presenter/avatar clip with support graphics |
| `character-animation` | Local character/rig animation with action timeline artifacts |
| `cinematic` | Trailer-style sample with motion-led scenes and music |
| `clip-factory` | Source video to multiple short-form cuts |
| `documentary-montage` | Visual montage with documentary pacing and editor handoff |
| `hybrid` | Source footage plus generated/support visuals |
| `localization-dub` | Short source clip with translated/dubbed output |
| `podcast-repurpose` | Podcast/audio episode to highlight package |
| `screen-demo` | Synthetic terminal or UI demo |
| `talking-head` | Cleaned presenter/talking-head edit |
| `daily-news` | Short news/narration package with topical source handling |

Optional extension demos:

| Workflow | Treatment |
|---|---|
| `music-video` | Full audio-led music video workflow, not only zero-key starter compose |
| `news-song` | News/protest song pipeline with topical source handling |
| TheChaosFM | Branded show starter using `news-song` or `music-video` plus `thechaosfm-gta-political` |
| WW2 diary | Show starter on `cinematic`, not a new pipeline |
| Last Rev | Show/demo starter on `animated-explainer` or `screen-demo` |
| Rave Queen | Show/demo starter on `cinematic` or `animation` |

## Review Loop

For each demo, capture:

- exact CLI command and `predit` version/path
- provider availability and selected provider profile
- stage artifacts under `projects/<show>/<episode>/`
- `render_report`, `cost_log`, `decision_log`, and final review
- `ffprobe` duration, resolution, frame rate, and audio presence
- export package path and target
- notes comparing the output to the reference baseline

Classify differences as migration bug, intentional CLI-model difference, provider drift, or creative variance.
