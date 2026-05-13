# 03 — CLI

## Design priorities

1. Verb-first command shape (git / cargo / npm idiom).
2. `<show>/<episode>` addressing — mirrors `shows/<show>/episodes/<episode>.yaml`.
3. Cwd-aware shortcuts — inside `shows/<show>/`, the show prefix is inferred.
4. Sample-first is a first-class flag, not a separate workflow.
5. NLE export is a top-level verb (the differentiator).
6. Every command supports `--json` for orchestration by agents.

## Command surface

```bash
# Project lifecycle
predit init                              # scaffold a new predit project in cwd
predit doctor                            # registry + tool preflight (capability menu)

# Create
predit new show <slug>                   # scaffold shows/<slug>/
predit new episode <show> [<slug>]       # scaffold an episode under a show
predit new pipeline <slug>               # scaffold a new pipeline + director skills
predit new playbook <slug>               # scaffold a new style playbook

# Build / run
predit build <show>/<episode>            # run pipeline; pauses at checkpoints
predit build <show>/<episode> --sample   # 15-20s sample run
predit build <show>/<episode> --from <stage>
predit build <show>/<episode> --only <stage>
predit build <show>/<episode> --to <stage>
predit build <show>/<episode> --budget <usd>

predit cuesheet <show>/<episode>        # build/cache audio cuesheet for debugging
predit resume <show>/<episode>           # pick up at next checkpoint
predit status [<show>[/<episode>]]       # state + cost + last decision
predit approve <show>/<episode>          # advance past awaiting_human
predit approve <show>/<episode> --force "<reason>"  # audited force-approval for failed final_review
predit revise <show>/<episode> "<note>"  # loop the current stage with note

# Inspect
predit ls shows | episodes <show> | pipelines | playbooks | tools | decisions <show>/<episode>
predit show <show>/<episode>             # full state dump of an episode

# Export (the differentiator)
predit export <show>/<episode> --target premiere   # Premiere XML + linked assets
predit export <show>/<episode> --target capcut     # CapCut draft
predit export <show>/<episode> --target davinci    # Resolve XML
predit export <show>/<episode> --format edl        # raw EDL

# Ingest
predit import <path> --as <show>/<episode>     # scaffold an episode from a dropped folder
predit watch                                    # detect drops and suggest imports

# Tooling
predit setup <tool>                      # shell out to the tool's native login/install
predit tools <name>                      # tool detail (CLI vs API, env vars, cost)
```

## Global flags

| Flag | Meaning |
|---|---|
| `--json` | Machine-readable output (for agents and scripts) |
| `--dry-run` | Plan without spending |
| `--verbose` / `-v` | Show every decision and tool call |
| `--no-color` | Strip ANSI color codes |
| `--config <path>` | Override `show.yaml` location |

## Cwd-aware shortcuts

```bash
cd shows/music-videos/
predit build midnight-train              # show inferred from cwd
predit status                            # all episodes under the current show
```

## Interactive vs non-interactive

- **Default: interactive.** `predit build` prompts inline at each `human_approval: required` checkpoint with `(approve | revise | abort)`.
- **`--non-interactive`** (or `CI=true`): the command pauses at the first required approval and exits with `status: awaiting_human`. Advance with `predit approve` or loop with `predit revise`. This is the mode agents (e.g. Claude Code) drive `predit` in.

## Output format

- Default output is human-readable with picocolors.
- `--json` switches to NDJSON for streaming-friendly machine output. Each command documents its event schema in its source.
- Errors always go to stderr; results to stdout.

## Addressing — `<show>/<episode>`

- The path separator is `/`, mirroring filesystem layout.
- `predit build music-videos/midnight-train` resolves `shows/music-videos/episodes/midnight-train.yaml`.
- Listing forms drop the episode: `predit ls episodes music-videos`.
