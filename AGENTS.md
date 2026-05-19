# Show Sidekick — harness contributor contract

This file is the operating contract for agents (Claude Code, Codex, others) working **inside the Show Sidekick harness repo** — adding features, fixing bugs, authoring new pipelines or skills, evolving the architecture.

**If you are an agent running production inside a user project** — making videos, building episodes, calling generation tools — you want the user-project AGENTS.md scaffolded into that project by `showkick init`. The template lives at `bundled/templates/user-project/AGENTS.md` in this repo. Do not use the file you are currently reading for production work.

## What Show Sidekick is

A show-first AI pre-production harness for video. Each show owns its pipeline, look, characters, brand. Episodes are the unit of work — one episode equals one rendered output. The harness ships as a CLI; users run it inside their own folder. Audio is the master clock for music-led content; voiceover is the master clock for narration-led content. The harness assembles a rough cut and an editor handoff (EDL / Premiere XML / CapCut draft) so a human can finish in a real NLE.

## Alpha Loop orchestration

This repo is initialized for Alpha Loop. `.alpha-loop.yaml` is the loop config, and GitHub issues are the source of truth for epic/task execution. Use the epic body and ordered sub-issue checklists as the source of truth for loop runs.

Default loop roles:

- Claude plans.
- Codex implements and fixes tests.
- Claude reviews.
- Codex validates when live verification is needed.

Alpha Loop source-of-truth agent assets live in `.alpha-loop/templates/` and sync to `.claude/`, `.codex/`, and `.agents/`. Edit `.alpha-loop/templates/` for loop agent/skill changes; do not hand-edit synced copies unless you are intentionally debugging sync output.

Alpha Loop generated learnings, sessions, traces, auth state, and backup files are ephemeral. They are intentionally gitignored and should not be committed or treated as product documentation.

## Read order on first contact

1. [`specs/README.md`](specs/README.md) — the spec index.
2. [`specs/00-overview.md`](specs/00-overview.md) and [`specs/10-installation-and-user-projects.md`](specs/10-installation-and-user-projects.md) — the architectural foundation.
3. [`specs/11-agent-driven-production.md`](specs/11-agent-driven-production.md) — the philosophy that makes the rest of the system make sense.
4. The spec(s) covering whatever you are touching today.

## Operating principles (for contributors to the harness)

- **Specs are the contract.** When a spec disagrees with code, one of them is wrong — never silently reconcile. Surface the discrepancy. If a decision changes, edit the spec in the same commit as the code change.
- **Don't break tests, don't break consumer contracts.** The harness is consumed as a CLI + library by user projects. Breaking changes to `show.yaml`, `episode.yaml`, the tool registry shape, pipeline manifests, or checkpoint schemas need a major version bump and a migration note.
- **Pipelines stay declarative.** Workflow lives in `pipelines/*.yaml`. How-to lives in stage director skills (Markdown). Concrete tools live in `src/tools/`. Do not blend layers.
- **Authoring a pipeline is a manifest + a handful of director skills.** It is not a TypeScript refactor. If you find yourself writing new orchestration logic to support a new pipeline, you're probably solving the wrong problem.
- **No ad-hoc shell scripts to call tools.** The harness invokes tools through the registry; tests do the same; nobody shells out around it.

## Build, test, run

```bash
pnpm install
pnpm test                       # vitest
pnpm typecheck                  # tsc --noEmit
pnpm build                      # tsc → dist/
pnpm dev <args>                 # tsx watch src/cli/index.ts
```

## What not to do

- Do not commit credentials. Show Sidekick does not store credentials; CLI tools own their own auth.
- Do not add a feature without first checking whether an existing pipeline + skill could express it. New code is the last resort, not the first.
