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
predit init --git                        # scaffold, git init, add, and commit
predit init --starter animated-explainer # scaffold and clone the first-video starter show
predit init --no-setup-runtimes          # skip default Remotion CLI stack + HyperFrames install
predit doctor                            # registry + tool preflight (capability menu)
predit doctor --profile paid-demo        # preflight a named provider profile
predit update                            # refresh .predit/ from the installed harness
predit update --check                    # verify .predit/ without writing

# Create
predit new show <slug>                   # scaffold shows/<slug>/ with the bundled music-video pipeline
predit new show <slug> --pipelines a,b   # scaffold a show bound to existing pipeline manifests
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
predit build <show>/<episode> --reference <url-or-path>
predit build <show>/<episode> --provider-profile paid-demo

predit cuesheet <show>/<episode>        # build/cache audio or derived voiceover cuesheet for debugging/export
predit resume <show>/<episode>           # pick up at next checkpoint
predit status [<show>[/<episode>]]       # state + cost + last decision
predit approve <show>/<episode>          # advance past awaiting_human
predit approve <show>/<episode> --force "<reason>"  # audited force-approval for failed final_review
predit revise <show>/<episode> "<note>"  # loop the current stage with note

# Inspect
predit ls shows | episodes <show> | pipelines | playbooks | starters | tools | decisions <show>/<episode>
predit show <show>/<episode>             # full state dump of an episode

# Export (the differentiator)
predit export <show>/<episode> --target premiere   # Premiere XML + linked assets
predit export <show>/<episode> --target capcut     # CapCut draft
predit export <show>/<episode> --target davinci    # Resolve XML
predit export <show>/<episode> --format edl        # raw EDL
predit export <show>/<episode> --target premiere --asset-link-mode copy
predit export <show>/<episode> --target premiere --out handoffs
predit export <show>/<episode> --target premiere --overwrite

# Ingest
predit import <path> --as <show>/<episode>     # scaffold an episode from a dropped folder
predit watch                                    # detect drops and suggest imports

# Tooling
predit setup <tool>                      # shell out to the tool's native login/install
predit setup runtimes                    # install Remotion CLI stack + HyperFrames locally
predit tools <name>                      # tool detail (CLI vs API, env vars, cost)
```

## Global flags

| Flag | Meaning |
|---|---|
| `--json` | Machine-readable output (for agents and scripts) |
| `--dry-run` | Plan without spending |
| `--cost-drift-threshold <multiplier>` | Override the cumulative cost-drift reviewer threshold for this run |
| `--verbose` / `-v` | Show every decision and tool call |
| `--no-color` | Strip ANSI color codes |
| `--config <path>` | Override `show.yaml` location |

## Project root requirement

Every command except `predit init` must run inside a predit user project, detected by walking upward from the current directory until both `CLAUDE.md` and `.predit/` are found. When no project root is found, the CLI errors before command execution and points the user to `predit init`.

## Cwd-aware shortcuts

```bash
cd shows/music-videos/
predit build midnight-train              # show inferred from cwd
predit status                            # all episodes under the current show
```

## Interactive vs non-interactive

- **Default: interactive.** `predit build` prompts inline at each `human_approval: required` checkpoint with `(approve | revise | abort)`.
- **`--non-interactive`** (or `CI=true`): the command pauses at the first required approval and exits with `status: awaiting_human`. Advance with `predit approve` or loop with `predit revise`. This is the mode agents (e.g. Claude Code) drive `predit` in.

## Reference-Driven Builds

`predit build <show>/<episode> --reference <url-or-path>` analyzes a reference video before pipeline selection and before the Runner starts. When the flag is omitted, `inputs.reference` in `episode.yaml` is used if present. URLs are detected with `new URL()` for `http:`, `https:`, and `file:` protocols; non-URLs resolve first against cwd, then against `<project>/music_library/`.

The analysis writes `projects/<show>/<episode>/artifacts/video_analysis_brief.json`, emits a `reference_analysis` event in JSON mode, and threads the `video_analysis_brief` artifact into every stage and reviewer pass. If the episode omits `pipeline`, the brief may steer selection from the show's default to a declared reference-capable pipeline; an explicit `episode.pipeline` remains authoritative.

## Output format

- Default output is human-readable with picocolors.
- `--json` switches to NDJSON for streaming-friendly machine output. Each command documents its event schema in its source.
- Errors always go to stderr; results to stdout.
- Human-mode `predit init` prints first-run next steps: run `predit doctor --profile paid-demo`, choose or build a starter/show, and ask the user's agent to read `AGENTS.md` plus `.predit/skills/meta/onboarding.md` for a personalized no-key first video. `predit init` installs Remotion, the Remotion CLI stack, and HyperFrames by default when Node 22+ and npm are available; `--no-setup-runtimes` skips that install. It also mirrors bundled Layer 3 agent skills into `.agents/skills/` and `.claude/skills/` for native agent discovery.
- `predit cuesheet` builds a normal audio-led cuesheet when `episode.inputs.track` is present. For completed voiceover-led episodes without a track input, it may derive a cuesheet from `script.json`, `scene_plan.json`, `edit_decisions.json`, and `render_report.json` so editor export can proceed from completed artifacts.

## Maintainer Demo Matrix

`pnpm demo-matrix` is a harness-maintainer script, not an installed `predit` command. It creates fresh temp user projects outside the harness repo, runs the local or overridden CLI path, initializes fixture-backed starters, and invokes `predit build <show>/sample-episode --sample`. Flags:

| Flag | Meaning |
|---|---|
| `--zero-key` | Run lanes whose `sample_support` includes `zero-key`; this is the default. |
| `--paid-demo` | Run lanes whose `sample_support` includes `paid`, passing `--provider-profile paid-demo`. |
| `--only <slug>` | Restrict to one or more starter slugs. |
| `--keep-workdir` | Keep generated temp user projects for inspection. |
| `--json` | Emit NDJSON `matrix_started`, `lane_completed`, and `matrix_finished` events. |
| `--cli-path <path>` | Override the local TypeScript CLI entrypoint or installed binary. |

The matrix records CLI path/version, provider profile, env availability, workdir, per-lane command, exit code, last event, and artifact paths. It exits `0` only when every selected lane completes; otherwise it exits `2`.

## Ingest Commands

`predit import <path> --as <show>/<episode>` resolves `<path>` as either a dropped file or a folder containing a matching dropped file. It matches the path against the target show's `ingest.watch[]`, uses the matched watch entry's `pipeline`, derives sibling inputs, and writes `shows/<show>/episodes/<episode>.yaml`. It refuses to overwrite an existing episode file.

`predit watch` loads every show's `ingest.watch[]`, watches the declared paths recursively, and prints a suggested `predit import <path> --as <show>/<derived-episode>` command when a drop matches. Watch suggestions are emitted within two seconds of the filesystem event.

## Addressing — `<show>/<episode>`

- The path separator is `/`, mirroring filesystem layout.
- `predit build music-videos/midnight-train` resolves `shows/music-videos/episodes/midnight-train.yaml`.
- Listing forms drop the episode: `predit ls episodes music-videos`.
- `predit ls starters` includes each starter's name, description, declared pipeline keys, fixture size, and expected sample duration so agents can choose a starter without opening every template.
