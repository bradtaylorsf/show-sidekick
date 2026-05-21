# Quickstart

This guide gets a fresh project to a free 30-second animated explainer sample and an editor handoff.

Maintainers preparing a public npm release should use the [release checklist](release-checklist.md) after validating this user path.

For terminology, see [Concepts](concepts.md). For copy-paste agent workflows, see the [Prompt Library](prompt-library.md).

## Non-Technical Path

Use this path when an agent is helping you.

1. Paste the setup prompt from the README into your coding agent.
2. Let the agent ask for a project folder name.
3. Let the agent check Node 22+, npm, Git, FFmpeg, and ffprobe.
4. If something is missing, the agent must ask before installing it.
5. Python and uv are optional tool runtimes. They are not required for the first no-key video.
6. After setup, the agent installs Show Sidekick globally, creates the project folder, initializes it, and runs the starter sample without paid provider credits.

The agent should run:

```bash
npm install -g show-sidekick@latest
mkdir my-first-video
cd my-first-video
showkick init --starter animated-explainer --git
showkick doctor
showkick build animated-explainer/sample-episode --sample
showkick export animated-explainer/sample-episode --target premiere
```

Before any later paid generation, the agent must ask with the likely provider, model or tool, purpose, sample/full-run scope, and rough cost.

## Technical Path

Check your tools:

```bash
node --version
npm --version
git --version
ffmpeg -version
ffprobe -version
python3 --version
uv --version
```

Node must be 22 or newer. Python and uv may be missing unless you plan to use a Python-backed local tool.

Create the project:

```bash
npm install -g show-sidekick@latest
mkdir my-shows
cd my-shows
showkick init --starter animated-explainer --git
```

The scaffold creates `AGENTS.md`, `CLAUDE.md`, `.env.example`, a gitignored `.env`, project folders, and a local `.show-sidekick/` bundled-content cache for agents to read. It also generates `.agents/skills/` and `.claude/skills/` mirrors for agent-native skill discovery.

## No-Key First Video

The `animated-explainer` starter can run before you configure provider keys:

```bash
showkick doctor
showkick build animated-explainer/sample-episode --sample
showkick export animated-explainer/sample-episode --target premiere
```

Runtime state lands under:

```text
projects/animated-explainer/sample-episode/
```

Exports land under:

```text
exports/
```

The sample writes a render, checkpoints, decision logs, cost records, and a voiceover cuesheet for editor handoff.

## Paid Provider Upgrade

You can add paid providers after the no-key sample works. Put keys in `.env` or export them in your shell, then run:

```bash
showkick doctor --profile paid-demo
showkick ls tools --json
```

Use [providers.md](providers.md) for the current provider catalog, required env vars, setup commands, and cost notes. Keep `.env` private and commit `.env.example` only.

Common paid unlocks include image generation, premium narration, music generation, video generation, avatar video, and hosted model APIs. Agents must ask before running commands that may spend credits.

## Editor Export

Premiere export:

```bash
showkick export animated-explainer/sample-episode --target premiere
```

Other targets exposed by the CLI include:

```bash
showkick export animated-explainer/sample-episode --target davinci
showkick export animated-explainer/sample-episode --target capcut
showkick export animated-explainer/sample-episode --format edl
```

If an export already exists, rerun with `--overwrite`.

## Troubleshooting

- Run `showkick doctor` first for project and tool readiness.
- Run `showkick update --check` if the local `.show-sidekick/` cache may be stale.
- Run commands from inside the folder created by `showkick init`.
- If FFmpeg is missing, install it only after approving the OS-specific command your agent proposes.
- If a paid provider is unavailable, check [providers.md](providers.md) for the exact env vars or login command.
