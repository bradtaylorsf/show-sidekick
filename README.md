# predit

Show-first AI pre-production for video: build the rough cut, then finish in Premiere, DaVinci, CapCut, or any NLE that reads EDL/XML.

**Status:** v0.1.0 public-flip candidate. The CLI, bundled starters, registry, runner, and NLE handoff formats are in active alpha; provider availability depends on the tools configured on your machine.

## Install

```bash
pnpm add -g predit
```

Requirements: Node 22+, pnpm 9+, and `ffmpeg` for local media work.

## 60-Second Quickstart

```bash
mkdir my-shows
cd my-shows
predit init --starter music-video --git
predit doctor --profile paid-demo
predit build music-video/sample-episode --sample
predit export music-video/sample-episode --target premiere
```

For an agent-guided blank project, run `predit init` and give Codex, Claude, or another agent this prompt:

```text
Read AGENTS.md and .predit/skills/meta/onboarding.md, then guide me through my first predit video.
```

The scaffolded `AGENTS.md` tells the agent to run `predit doctor --profile paid-demo`, choose a starter or pipeline, explain cost before paid generation, build a sample, and export an editor handoff. The full walkthrough is in [docs/quickstart.md](docs/quickstart.md), including provider setup, sample outputs, and troubleshooting.

## Features

- Show-first model: each show owns its brand, characters, defaults, ingest rules, and episode workspace.
- Audio-led pipelines: music videos, trailers, and news songs snap visual timing to beats, sections, and climax points.
- Starter shows: nine bundled templates scaffold show folders and sample fixtures; `music-video` includes a zero-key runnable sample.
- NLE handoff: Premiere XML, DaVinci XML, CapCut draft packages, and CMX 3600 EDL.
- Registry-driven tools: concrete integrations live in `src/tools/` and are selected by capability, availability, cost, and runtime.
- Integrated runner: checkpoints, approvals, resume state, first paid-call approval, and cost budget enforcement.
- Agent-readable production layer: pipeline manifests and director skills stay in Markdown/YAML instead of hard-coded orchestration.

## CLI Surface

`predit --help` lists the current command surface:

| Area | Commands |
|---|---|
| Project lifecycle | `init`, `doctor`, `update` |
| Create | `new show`, `new episode`, `new pipeline`, `new playbook` |
| Build / run | `build`, `cuesheet`, `resume`, `status`, `approve`, `revise` |
| Inspect | `ls`, `ls decisions <show>/<episode>`, `show` |
| Export / ingest | `export`, `import`, `watch` |
| Tooling | `setup <tool>`, `tools <name>` |

Global flags: `--json`, `--dry-run`, `--verbose`, `--no-color`, `--config <path>`.

Common flows:

- `predit init --starter music-video --git` scaffolds a user project, initializes git, and clones the music-video starter into `shows/music-video/`.
- `predit init` scaffolds a blank project with agent instructions, bundled pipeline cache, and first-run next steps.
- `predit doctor --profile paid-demo` checks OpenAI, ElevenLabs, Higgsfield, ffmpeg, and ffprobe readiness without spending provider credits.
- `predit new show <slug> --from <starter>` clones a starter-backed show; `predit new show <slug> --pipelines <pipeline>` creates a custom show bound to existing manifests.
- `predit new pipeline <slug>` creates `pipelines/<slug>.yaml` plus `skills/pipelines/<slug>/idea-director.md`.
- `predit update --check` verifies the local `.predit/` cache against the installed harness without writing.
- `predit build <show>/<episode> --sample` runs a short sample pass through the integrated Runner.
- `predit status <show>/<episode>` reports current stage, checkpoint status, costs, and the latest decision.
- `predit export <show>/<episode> --target premiere|davinci|capcut|edl` writes an editor handoff package under `exports/`; pass `--overwrite` to replace an existing package.
- `predit import <path> --as <show>/<episode>` and `predit watch` turn watched drops into episode YAML.
- `predit ls starters` lists bundled starter shows, fixture sizes, pipelines, and expected sample durations.

## Docs

- [specs/](specs/) - design specs and implementation contract
- [AGENTS.md](AGENTS.md) - harness contributor contract for agents working in this repo
- [CONTRIBUTING.md](CONTRIBUTING.md) - development setup and extension guide
- [docs/quickstart.md](docs/quickstart.md) - first rendered sample from a fresh machine
- [docs/demo-readiness.md](docs/demo-readiness.md) - maintainer demo readiness and green paths
- [docs/demo-matrix.md](docs/demo-matrix.md) - starter-backed demo matrix usage
- [docs/full-demo-benchmark.md](docs/full-demo-benchmark.md) - agent-led full benchmark plan across demo types and runtimes
- [docs/providers.md](docs/providers.md) - generated provider catalog from the registry
- [CHANGELOG.md](CHANGELOG.md) - release notes
- [LICENSE](LICENSE) - Apache-2.0

## License

Apache-2.0.
