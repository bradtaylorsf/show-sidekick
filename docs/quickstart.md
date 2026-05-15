# Quickstart

This walks a fresh machine from install to a 15-second music-video sample and an editor handoff.

## Prerequisites

- Node.js 22 or newer
- pnpm 9 or newer
- `ffmpeg` on `PATH` for local media work

The bundled `music-video` starter sample is zero-key: it does not require API credentials. See [providers.md](providers.md) when you want to unlock paid image, TTS, music, or video generation for custom episodes.

```bash
node --version
pnpm --version
ffmpeg -version
pnpm add -g predit
```

## Create a Project

```bash
mkdir my-shows
cd my-shows
predit init --starter music-video --git
```

For a blank, agent-guided project, run:

```bash
predit init
```

Then give your agent:

```text
Read AGENTS.md and .predit/skills/meta/onboarding.md, then guide me through my first predit video.
```

The agent contract tells Codex, Claude, or another agent to run `predit doctor --profile paid-demo`, explain available providers and runtimes, recommend a starter or pipeline, ask before paid generation, and record issues under `projects/<show>/<episode>/notes.md`.

The starter creates `shows/music-video/` with:

- `show.yaml` slug: `music-video`
- sample episode: `shows/music-video/episodes/sample-episode.yaml`
- sample inputs: `shows/music-video/inputs/sample-episode/track.wav` and `lyrics.txt`
- expected sample duration: 15 seconds
- fixture size: 120213 bytes

## Optional Provider Setup

You can render and export the starter sample before configuring any providers. For custom episodes, choose one `image_generation` tool and one `tts` tool from [providers.md](providers.md), set the listed env vars, then run `predit ls tools` to check availability.

```bash
export OPENAI_API_KEY="sk-..."
export ELEVENLABS_API_KEY="..."
higgsfield auth login
predit doctor --profile paid-demo
predit setup openai_image
predit setup openai_tts
predit ls tools
```

Or keep credentials project-local by copying `.env.example` to `.env` and filling in the same keys. `predit` loads `.env`, `.env.<command>`, and `.env.local` from the project root before each command; exported shell variables still take precedence. `.env` is gitignored by the scaffold.

## Render the Sample

```bash
predit build music-video/sample-episode --sample
```

Outputs and runtime state land under:

```text
projects/music-video/sample-episode/
```

That workspace holds checkpoints, generated assets, cost logs, decisions, and renders for the episode. The starter sample is designed as a short beat-synced rough cut from the bundled 15-second synthesized track and lyrics fixture.
The compose stage writes `projects/music-video/sample-episode/renders/sample-preview.mp4`.

## Export for Editing

```bash
predit export music-video/sample-episode --target premiere
```

Other targets:

```bash
predit export music-video/sample-episode --target davinci
predit export music-video/sample-episode --target capcut
predit export music-video/sample-episode --target edl
```

Exports are written under `exports/` by default, and each export records `projects/music-video/sample-episode/publish_log.json`.
If the package already exists, re-run with `--overwrite`.

## Troubleshooting

- `predit doctor` is the first command to try for project/tool preflight output.
- `predit status music-video/sample-episode` shows the current stage, last checkpoint status, and cost summary.
- `predit update --check` verifies that `.predit/` matches the installed harness.
- If a command says the project root is missing, run it from inside the folder created by `predit init`.
