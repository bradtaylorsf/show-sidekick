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

Build/run commands currently validate show, episode, pipeline, stage flags, resume checkpoints, approval checkpoints, audited final-review force approvals, revision notes, status state, and cost summaries. `build` runs the integrated Runner state machine: registry preflight, stage dispatch, reviewer pass, checkpoint writes, approval gates, budget limits, and resumable state.

Create/list commands scaffold project-local shows, episodes, pipelines, and playbooks, and list merged project-local plus `.predit` cache resources with JSON output for automation. `new playbook` uses the bundled playbook generator so the stub includes palette, typography, motion rules, audio mood, asset preferences, and quality rules.

## License

Apache 2.0 (planned, applied at first public release).
