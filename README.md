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
predit init --starter animated-explainer --git
# optional: add paid provider keys to the generated .env
predit doctor --profile paid-demo
predit build animated-explainer/sample-episode --sample
predit export animated-explainer/sample-episode --target premiere
```

For an agent-guided blank project, run `predit init` and give Codex, Claude, or another agent this prompt:

```text
Read AGENTS.md and .predit/skills/meta/onboarding.md. Ask me what I do, suggest three personalized no-key first-video ideas, then render a 30-second animated predit explainer.
```

The scaffolded `AGENTS.md` tells the agent to run `predit doctor --profile paid-demo`, ask what you do, use safe session context to suggest three first-video ideas, render a free narrated animated explainer before paid generation, and export an editor handoff. The full walkthrough is in [docs/quickstart.md](docs/quickstart.md), including provider setup, sample outputs, and troubleshooting.

## Features

- Show-first model: each show owns its brand, characters, defaults, ingest rules, and episode workspace.
- Audio-led pipelines: music videos, trailers, and news songs snap visual timing to beats, sections, and climax points.
- Starter shows: bundled templates scaffold show folders and sample fixtures; `animated-explainer` includes a zero-key narrated Remotion first-video sample with a voiceover cuesheet for editor export.
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
| Tooling | `setup <tool>`, `setup runtimes`, `tools <name>` |

Global flags: `--json`, `--dry-run`, `--verbose`, `--no-color`, `--config <path>`.

Common flows:

- `predit init --starter animated-explainer --git` scaffolds a user project, initializes git, writes `.env.example` and gitignored `.env`, and clones the animated-explainer starter into `shows/animated-explainer/`.
- `predit init` scaffolds a blank project with agent instructions, bundled pipeline cache, Codex/Claude skill mirrors, first-run next steps, and project-local Remotion/HyperFrames dependencies when npm is available. Use `--no-setup-runtimes` to skip the install.
- The scaffolded `.gitignore` keeps generated workspaces, renders, exports, local media, `.predit/`, and `.env` out of git while leaving shows, pipelines, playbooks, skills, and `.env.example` shareable.
- Shared project clones restore the gitignored `.predit/` cache automatically before commands run, using the locally installed harness version.
- Commands load `.env`, `.env.<command>`, and `.env.local` from the project root; shell environment variables win over file values.
- `predit doctor --profile paid-demo` checks OpenAI, ElevenLabs, Higgsfield, ffmpeg, and ffprobe readiness without spending provider credits.
- `predit setup runtimes` can be rerun later to repair or add Remotion, the Remotion CLI, aligned support deps, and HyperFrames as project-local dev dependencies when they were skipped or unavailable at init.
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
