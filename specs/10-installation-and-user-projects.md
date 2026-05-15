# 10 — Installation and User Projects

## Two-repo model

`predit` is installed as a CLI. The user runs the CLI inside their **own** folder, which is owned by them — not by `predit`. This separates the harness (versioned, public, Apache 2.0) from user content (their shows, their characters, their music, their license).

```
┌────────────────────────────────┐         ┌────────────────────────────────┐
│  predit  (this repo)           │         │  <user-project>  (their repo)  │
│  ─────────────────────         │         │  ─────────────────────────     │
│  Source: src/                  │  ───▶   │  shows/, episodes/             │
│  Bundled: pipelines/,          │ install │  brand/, characters/           │
│           playbooks/,          │         │  music_library/, projects/     │
│           skills/, schemas/,   │         │  CLAUDE.md, AGENTS.md          │
│           starters/            │         │  .predit/ (cache, gitignored)  │
│  Apache 2.0, public            │         │  user-owned, user's license    │
└────────────────────────────────┘         └────────────────────────────────┘
```

## Installation

Global install:

```bash
pnpm add -g predit
# or
npm install -g predit
```

Per-project install (no global pollution):

```bash
pnpx predit init
# or
npx predit init
```

## User project lifecycle

### `predit init`

Scaffolds a new user project in the current directory:

```bash
cd ~/my-shows
predit init                       # creates CLAUDE.md, AGENTS.md, .predit/, .gitignore
predit init --git                 # same, plus `git init`
predit init --starter music-video # scaffold a starter show alongside the project
```

Created files:

```
my-shows/
├── CLAUDE.md                # tiny pointer → AGENTS.md
├── AGENTS.md                # agent operating contract for this project
├── .gitignore               # excludes .predit/, projects/, music_library/
├── .predit/                 # local cache of bundled harness content (gitignored)
│   ├── version.json
│   ├── pipelines/
│   ├── playbooks/
│   ├── skills/
│   │   ├── pipelines/<pipeline>/<stage>-director.md
│   │   ├── meta/<name>.md
│   │   └── agents/<name>.md
│   ├── schemas/
│   └── starters/
├── shows/                   # user content (initially empty)
├── music_library/           # gitignored drop zone
└── projects/                # gitignored runtime workspace
```

### `predit update`

Refreshes `.predit/` from the currently installed harness version. Detects mismatch automatically on every command and warns when stale. The user runs `predit update` to sync.

`.predit/version.json` records the cache lock:

```json
{
  "harness_version": "0.1.0",
  "bundled_checksum": "sha256-of-bundled-cache-inputs",
  "locked_at": "2026-05-14T12:00:00.000Z"
}
```

`predit update --check` compares the installed harness version and bundled checksum against that file without writing. It exits non-zero when the cache is stale. Commands refuse to run when the cache was locked by an incompatible major version; the remediation is either `predit update` to refresh the project cache or installing a matching `predit` version.

`predit.lock` is a post-v0.1.0 team-pinning feature. v0.1.0 does not write or enforce `predit.lock`; cache compatibility is tracked only by `.predit/version.json`. When implemented, `predit init` will write the lock with harness version and bundled checksum, `predit update` will error on lock mismatch unless forced, and `predit update --check` will remain non-mutating and exit non-zero on mismatch.

### `predit new show <slug> [--from <starter>]`

Creates `shows/<slug>/`. With `--from <starter>`, copies a starter template from `.predit/starters/<starter>/` as the initial content. Starters carry an example `show.yaml`, a brand stub, sample characters, and an episode template.

Available starters listed by `predit ls starters`.

`predit ls starters` reports each starter's name, description, declared pipeline keys, fixture size, and expected sample duration. Starter metadata is read from the bundled starter's `show.yaml` when present, with fixture size derived from `inputs/` as a fallback.

## What is bundled vs user-owned

| Content | Lives in | Editable by user? |
|---|---|---|
| Source code | harness package | No (open-source PRs welcome) |
| Pipelines | `harness/pipelines/` → cached in `.predit/pipelines/` | Yes — override by placing same-named file in `<project>/pipelines/` |
| Playbooks | `harness/playbooks/` → cached in `.predit/playbooks/` | Yes — override in `<project>/playbooks/` |
| Director skills | `harness/skills/pipelines/...` → cached | Yes — override in `<project>/skills/pipelines/...` or per-show in `<project>/shows/<show>/skills/` |
| Meta skills | `harness/skills/meta/` → cached | Generally not — meta skills are the harness contract |
| Vendor skills (Layer 3) | `harness/skills/agents/` → cached | Yes — override in `<project>/skills/agents/` |
| Starters | `harness/starters/` → cached | No (cloned via `predit new show --from`, then user-edited) |
| Shows, characters, brand, episodes | `<project>/shows/` | Yes — fully user-owned |
| Capability-extension scripts/tools | `<project>/projects/<show>/<episode>/scripts/`, `<project>/projects/<show>/<episode>/tools/` | Yes — episode-scoped wrappers created through MET-11 |
| Music files, render outputs | `<project>/music_library/`, `<project>/projects/` | Yes (gitignored) |

## Resolution order

When the harness needs any resource (pipeline, playbook, skill, schema):

1. Check user project local path (`<project>/pipelines/<name>.yaml`, etc.).
2. Fall back to the cache (`<project>/.predit/pipelines/<name>.yaml`).
3. Error if neither exists.

User overrides always win. The bundled cache is read-only from the harness's perspective — `predit update` is the only thing that writes to it.

## Why a local cache instead of reading from `node_modules`

- Agents (Claude Code, Codex) navigate via filesystem reads. `.predit/skills/...` is a stable, predictable path inside the project. `node_modules/predit/...` is brittle (depends on install method, pnpm hoisting, global vs local).
- The cache is gitignored, so a fresh clone of the user's project doesn't carry stale harness content; `predit update` repopulates from whatever harness version is installed.
- The cache version is tracked in `.predit/version.json` so the harness can warn on mismatch and refuse to operate on a project cached against an incompatible major version.

## User project is user-owned

The user picks the license, the source-control host, the backup strategy, and what to publish. The harness has no opinion on whether their `shows/` directory is a public GitHub repo or a personal Backblaze backup. `predit` produces video; it does not manage user content.

## Multi-user / team scenarios

A team can share a user project the same way they share any git repo. The cached `.predit/` is gitignored — each contributor's `.predit/` reflects their locally installed harness version. Recommend pinning the harness version in a `predit.lock` file (future feature) so all collaborators stay in sync.
