# Quickstart

This walks a fresh machine from install to a 15-second music-video sample and an editor handoff.

## Prerequisites

- Node.js 22 or newer
- pnpm 9 or newer
- `ffmpeg` on `PATH`
- At least one image provider and one TTS provider configured

One simple setup is `OPENAI_API_KEY`, which enables `openai_image` and `openai_tts`. See [providers.md](providers.md) for the generated provider table.

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

The starter creates `shows/music-video/` with:

- `show.yaml` slug: `music-video`
- sample episode: `shows/music-video/episodes/sample-episode.yaml`
- sample inputs: `shows/music-video/inputs/sample-episode/track.wav` and `lyrics.txt`
- expected sample duration: 15 seconds
- fixture size: 120213 bytes

## Configure Providers

For OpenAI image and TTS:

```bash
export OPENAI_API_KEY="sk-..."
predit setup openai_image
predit setup openai_tts
predit ls tools
```

For another provider combination, choose one `image_generation` tool and one `tts` tool from [providers.md](providers.md), set the listed env vars, then run `predit ls tools` to check availability.

## Render the Sample

```bash
predit build music-video/sample-episode --sample
```

Outputs and runtime state land under:

```text
projects/music-video/sample-episode/
```

That workspace holds checkpoints, generated assets, cost logs, decisions, and renders for the episode. The starter sample is designed as a short beat-synced rough cut from the bundled 15-second synthesized track and lyrics fixture.

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

## Troubleshooting

- `predit doctor` is the first command to try for project/tool preflight output.
- `predit status music-video/sample-episode` shows the current stage, last checkpoint status, and cost summary.
- `predit update --check` verifies that `.predit/` matches the installed harness.
- If a command says the project root is missing, run it from inside the folder created by `predit init`.
