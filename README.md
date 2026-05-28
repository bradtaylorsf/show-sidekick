# Show Sidekick

Show Sidekick helps you turn an idea into a video rough cut and an editor handoff that can be finished in Premiere, DaVinci, CapCut, or any NLE that reads EDL/XML.

**Status:** v0.1.0 public release candidate. The CLI, bundled starters, registry, runner, and NLE export formats are in active alpha; paid provider availability depends on your local keys and logins.

## What It Does

- Creates a project with agent-readable instructions, starter shows, pipelines, and provider setup hints.
- Gives Codex, Claude Code, and similar agents a clear production contract in `AGENTS.md`.
- Builds a free first sample from the `animated-explainer` starter before any paid provider is required.
- Tracks approvals, checkpoints, cost estimates, and generated assets under the project workspace.
- Exports a Premiere package today, with DaVinci, CapCut, and EDL handoff paths in the CLI surface.

## Requirements

- Node.js 22 or newer
- npm, included with Node
- Git
- FFmpeg and ffprobe on `PATH`
- Optional: Python and uv for specialized local tools, not for the first no-key video

Show Sidekick does not store credentials. Paid providers use your environment variables, local `.env`, or provider CLI login.

## Quickstart

The simplest shape is: install the CLI globally once, create an empty folder for each video project, then run `showkick init` inside that folder. `showkick init` writes the project scaffold into the current directory.

### Option 1: Paste This Into Your Coding Agent

Use this with Codex, Claude Code, Cursor, or another local coding agent:

```text
Help me set up Show Sidekick in a fresh project folder and make my first no-key video.

Ask me what folder name to use. If I do not care, use show-sidekick-first-video. Check Node 22+, npm, Git, FFmpeg, and ffprobe without changing my machine. Also check Python and uv, but treat them as optional tool runtimes, not blockers for the first no-key video.

If a system prerequisite is missing, explain what it is for and ask before installing it. On macOS, prefer the official Node installer or Homebrew only after I approve. On Windows, prefer the official Node installer or winget only after I approve. Do not install Python, uv, FFmpeg, Git, Node, npm, Homebrew, winget packages, or provider CLIs without asking first.

Once Node and npm are available, install or update Show Sidekick globally:
npm install -g show-sidekick@latest
showkick --version

Create the project folder, cd into it, then initialize Show Sidekick:
mkdir -p <folder-name>
cd <folder-name>
showkick init --starter animated-explainer --git

For the first artifact, do not spend provider credits. Read AGENTS.md and .show-sidekick/skills/meta/onboarding.md, ask what I do, suggest three personalized no-key video ideas, choose the strongest one if I ask you to proceed, then run:
showkick doctor
showkick build animated-explainer/sample-episode --sample
showkick export animated-explainer/sample-episode --target premiere

Before any later command that may spend provider credits, stop and ask me for approval with the likely provider, model or tool, purpose, sample/full-run scope, and rough cost.
```

### Option 2: Run It Yourself

```bash
npm install -g show-sidekick@latest
mkdir my-first-video
cd my-first-video
showkick init --starter animated-explainer --git
showkick doctor
showkick build animated-explainer/sample-episode --sample
showkick export animated-explainer/sample-episode --target premiere
```

The first build uses the bundled starter and can run without API keys. The export writes an editor handoff under `exports/`.

## No-Key Starter

The fastest free path is the `animated-explainer` starter. It renders a short narrated motion-graphics sample from local starter inputs and uses local/free capabilities where available. It is meant to prove the project works before you add paid image, voice, music, or video providers.

Free/no-key work includes project scaffolding, preflight checks, bundled starter files, local composition, and public/no-key sources exposed by the registry. Work that may spend provider credits includes paid image generation, premium TTS, music generation, video generation, avatar video, and hosted model APIs.

Agents must ask before paid generation. They should state the provider, model or tool, why it is needed, whether it is a sample or full run, and the rough cost before continuing.

## Paid Provider Upgrade

After the no-key sample works, add provider keys to the generated `.env` file or export them in your shell. Then run:

```bash
showkick doctor --profile paid-demo
showkick ls tools --json
```

Use [docs/providers.md](docs/providers.md) to see which env vars or CLI logins unlock each provider. Keep `.env` private; commit `.env.example` only.

## Core Ideas

- **Project:** the folder where `showkick init` ran. It owns your shows, generated projects, exports, `.env`, and local overrides.
- **Show:** a reusable video series or channel identity. A show owns brand, characters, pipeline defaults, and episodes.
- **Episode:** one concrete video output inside a show. Build and export commands target `show/episode`.
- **Inputs:** local source PDFs, decks, audio, video, images, and inspiration folders copied by `showkick new episode <show> <episode> --from <path>` into `inputs/<show>/<episode>/`.
- **Pipeline:** the production workflow, such as `animated-explainer`, `music-video`, `screen-demo`, or `documentary-montage`.
- **Playbook:** the creative/style treatment layered onto a pipeline.
- **Starter:** a complete example show you can clone to begin quickly.
- **Tools:** provider and local capabilities the harness can call, such as renderers, image generation, TTS, transcription, FFmpeg, and stock search.
- **Decisions:** the audit log of choices about providers, models, runtime, budget, approvals, and substitutions.

See [docs/concepts.md](docs/concepts.md) for the full glossary and command map.

## Prompt-First Workflows

You do not have to memorize the CLI. Use [docs/prompt-library.md](docs/prompt-library.md) for copy-paste prompts that ask an agent to set up a project, create a show, add an episode, create a pipeline, write a playbook, inspect tools, build, export, resume, approve, revise, import drops, and update the local cache.

## What Show Sidekick Can Make

See [docs/show-types.md](docs/show-types.md) for the show type catalog. It separates reusable pipeline show types from complete generalized starters such as animated explainers, music videos, news songs, screen demos, product demos, cinematic trailers, documentary montages, and source-led repurposing workflows.

Maintainers can validate the catalog without publishing:

```bash
pnpm show-types:check
pnpm show-types:matrix --zero-key
pnpm show-types:matrix --paid-demo
```

## Docs

- [Quickstart](docs/quickstart.md)
- [Concepts](docs/concepts.md)
- [Prompt library](docs/prompt-library.md)
- [Providers](docs/providers.md)
- [Show types](docs/show-types.md)
- [Troubleshooting](docs/quickstart.md#troubleshooting)
- [Contributing](CONTRIBUTING.md)
- [Release checklist](docs/release-checklist.md)
- [Release notes](CHANGELOG.md)
- [Specs](specs/)

## License

Apache-2.0.
