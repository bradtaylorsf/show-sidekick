# predit

AI pre-production for video. Builds the rough cut and an EDL/XML you finish in Premiere or CapCut.

**Status:** in active development. Public release on Apache 2.0 once the core pipelines reach feature parity.

## What it does

`predit` is a show-first video production harness. You author a *show* once — its pipeline, look, characters, brand — then add *episodes*, where each episode is one rendered output. The agent drives production stage by stage, snaps visuals to audio structure (beats, sections, climax), and hands off a rough cut you can ship as draft or finish in a real NLE.

## Quick links

- [`specs/`](specs/) — the design specs that drive implementation
- [`AGENTS.md`](AGENTS.md) — agent operating contract

## CLI Surface

`predit --help` lists the current command surface:

| Area | Commands |
|---|---|
| Project lifecycle | `init`, `doctor`, `update` |
| Create | `new show`, `new episode`, `new pipeline`, `new playbook` |
| Build / run | `build`, `cuesheet`, `resume`, `status`, `approve`, `revise` |
| Inspect | `ls`, `ls decisions <show>/<episode>`, `show` |
| Export / ingest | `export`, `import`, `watch` |
| Tooling | `setup`, `tools` |

Global flags: `--json`, `--dry-run`, `--verbose`, `--no-color`, `--config <path>`.

`predit init` now scaffolds a user project in the current directory, including `CLAUDE.md`, `AGENTS.md`, `.gitignore`, empty `shows/`, gitignored `projects/` and `music_library/`, and a versioned `.predit/` cache copied from the installed harness. `predit init --git` initializes and commits the scaffold. `predit init --starter <name>` also clones a bundled starter show into `shows/<name>/`.

Every command except `predit init` must run inside a predit project. The CLI detects the project root by walking upward until it finds `CLAUDE.md` and `.predit/`, and points to `predit init` when those markers are missing.

`predit update` refreshes `.predit/` from the installed harness and rewrites `.predit/version.json`. `predit update --check` verifies the cache without writing and exits non-zero when stale. Commands warn when the cache version is stale and refuse to run across incompatible major versions.

`predit import <path> --as <show>/<episode>` matches a dropped file or folder against that show's `ingest.watch[]` rules, detects the target pipeline and sibling inputs, and writes a new episode YAML without clobbering an existing one. `predit watch` monitors all configured show ingest paths and prints the matching `predit import` command within two seconds of a detected drop.

Build/run commands currently validate show, episode, pipeline, stage flags, reference inputs, resume checkpoints, approval checkpoints, audited final-review force approvals, revision notes, status state, and cost summaries. `build` runs the integrated Runner state machine: optional `--reference <url-or-path>` / `inputs.reference` video analysis before pipeline selection, registry preflight, stage dispatch, reviewer pass, checkpoint writes, approval gates, budget limits, configurable cost-drift review thresholds, and resumable state.

Create/list commands scaffold project-local shows, episodes, pipelines, and playbooks, and list merged project-local plus `.predit` cache resources with JSON output for automation. `predit ls starters` includes each bundled starter's description, declared pipelines, fixture size, and expected sample duration. `new playbook` uses the bundled playbook generator so the stub includes palette, typography, motion rules, audio mood, asset preferences, and quality rules.

## License

Apache 2.0 (planned, applied at first public release).
