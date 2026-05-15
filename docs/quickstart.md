# Quickstart

This walks a fresh machine from install to a 30-second personalized no-key animated explainer and an editor handoff.

## Prerequisites

- Node.js 22 or newer
- pnpm 9 or newer
- `ffmpeg` on `PATH` for local media work

The bundled `animated-explainer` starter sample is zero-key: it does not require API credentials. Its sample renderer turns the starter script lines into narrated animated cards, uses local TTS when available, and renders with Remotion when runtime setup is present. See [providers.md](providers.md) when you want to unlock paid image, premium TTS, music, or video generation for custom episodes.

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
predit init --starter animated-explainer --git
```

`predit init` creates both `.env.example` and a gitignored `.env`. Fill `.env` with any provider keys you want to use; keep `.env.example` committed as the blank setup map for collaborators and agents.
It also mirrors bundled Layer 3 agent skills into `.agents/skills/` and `.claude/skills/` so Codex and Claude-style agents can discover provider/runtime skills natively, then installs Remotion, the Remotion CLI stack, and HyperFrames as project-local dev dependencies when npm is available. Use `--no-setup-runtimes` only when you want a scaffold without npm installs.

For a blank, agent-guided project, run:

```bash
predit init
```

Then give your agent:

```text
Read AGENTS.md and .predit/skills/meta/onboarding.md. Ask me what I do, suggest three personalized no-key first-video ideas, then render a 30-second animated predit explainer.
```

The agent contract tells Codex, Claude, or another agent to refresh/check `.predit/`, run `predit doctor --profile paid-demo`, explain available providers and runtimes, ask what you do, suggest three first-video ideas from safe project/session context, ask before paid generation, and record issues under `projects/<show>/<episode>/notes.md`.

For the fastest no-key first video, the agent should scaffold the `animated-explainer` starter and rewrite `shows/<show>/inputs/sample-episode/script.txt` into four short narrated card lines: a tailored hook, a personal-use beat, a predit workflow beat, and the next step. Then `predit build <show>/sample-episode --sample` renders a free animated explainer that the user can inspect before adding paid providers.

The starter creates `shows/animated-explainer/` with:

- `show.yaml` slug: `animated-explainer`
- sample episode: `shows/animated-explainer/episodes/sample-episode.yaml`
- sample inputs: `shows/animated-explainer/inputs/sample-episode/script.txt` and `reference.jpg`
- expected sample duration: 30 seconds
- fixture size: 1979 bytes

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

Or keep credentials project-local by filling the generated `.env` with the same keys. `predit` loads `.env`, `.env.<command>`, and `.env.local` from the project root before each command; exported shell variables still take precedence. `.env` is gitignored by the scaffold, while `.env.example` is safe to commit.

`predit setup runtimes` can be rerun if runtime setup was skipped, failed because npm was unavailable, or needs repair. It installs Remotion, the Remotion CLI, aligned support deps, and HyperFrames into the user project so agents can offer them alongside FFmpeg before locking a render runtime.

## Render the Sample

```bash
predit build animated-explainer/sample-episode --sample
```

Outputs and runtime state land under:

```text
projects/animated-explainer/sample-episode/
```

That workspace holds checkpoints, generated assets, cost logs, decisions, and renders for the episode. The starter sample is designed as a short narrated motion-graphics explainer from the script-card fixture.
The compose stage writes `projects/animated-explainer/sample-episode/renders/sample-preview.mp4`.

## Export for Editing

```bash
predit export animated-explainer/sample-episode --target premiere
```

Other targets:

```bash
predit export animated-explainer/sample-episode --target davinci
predit export animated-explainer/sample-episode --target capcut
predit export animated-explainer/sample-episode --target edl
```

Exports are written under `exports/` by default, and each export records `projects/animated-explainer/sample-episode/publish_log.json`.
If the package already exists, re-run with `--overwrite`.

The generated `.gitignore` excludes `projects/`, `exports/`, `renders/`, `output/`, `outputs/`, `.predit/`, `.env`, and bulky local media folders. Commit `shows/`, `pipelines/`, `playbooks/`, `skills/`, and `.env.example` when you want to share the workflow without generated video assets or credentials.
When another machine or agent clones the project, the first predit command restores the gitignored `.predit/` cache from the installed harness before running.

## Troubleshooting

- `predit doctor` is the first command to try for project/tool preflight output.
- `predit status animated-explainer/sample-episode` shows the current stage, last checkpoint status, and cost summary.
- `predit update --check` verifies that `.predit/` matches the installed harness.
- If a command says the project root is missing, run it from inside the folder created by `predit init`.
