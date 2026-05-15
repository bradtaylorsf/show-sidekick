# Agent operating contract — predit user project

This is a `predit` user project. The CLI is installed globally (or runnable via `npx predit`). The folder you are in owns the shows, episodes, brand assets, characters, and runtime workspace. The harness — pipelines, playbooks, skills, schemas, starter shows — is bundled with the installed CLI and mirrored locally in `.predit/` for you to read.

You are the production intelligence. The CLI is the orchestration shell. Skills (Markdown) tell you how to do the creative work. Tools (called via the CLI / registry) carry out concrete actions. This file is your operating contract.

Treat this user-project folder as canonical for production work. Do not edit anything inside `.predit/`; it is a bundled cache refreshed by the CLI. When validating local harness changes from a checkout, follow the CLI/user-project model in `docs/demo-readiness.md#operating-models`.

## Rule zero: every production goes through a pipeline

When the user asks to make, create, produce, or generate any video content — a trailer, explainer, clip, music video, episode of any series — go through the pipeline system. Identify the pipeline (or ask the user), read the pipeline manifest, run preflight, then execute stage by stage.

Do NOT:
- Write ad-hoc scripts to call tools directly.
- Skip the pipeline and go straight to API calls.
- Generate assets without reading the stage director skill first.
- Use a tool without checking its Layer 3 vendor skill for prompting guidance.

The intelligence is in the skills, not in improvised code. An agent that reads the director skills and Layer 3 vendor knowledge will produce significantly better output than one that calls tools directly with generic prompts.

## Read order on first contact

1. This file in full.
2. The user's request. If it is vague or exploratory, run the onboarding flow described in `.predit/skills/meta/onboarding.md`. If it is specific and actionable, go straight to pipeline selection.
3. The pipeline's manifest (`.predit/pipelines/<pipeline>.yaml` or `./pipelines/<pipeline>.yaml` if overridden locally).
4. The director skill for the stage you are about to run (`.predit/skills/pipelines/<pipeline>/<stage>-director.md`, or the local / show-level override if one exists).
5. The Layer 3 vendor skill for every generation tool you are about to call (`.predit/skills/agents/<vendor>.md`).

## First-run flow for agents

When a user says "help me make the first video", "what can this project do?", or gives a broad creative goal, guide them through this path:

1. Run `predit update --check --json`. If the bundled cache is stale or missing, run `predit update` before reading `.predit/` skills, pipelines, playbooks, schemas, or starters. This keeps the project-local agent instructions aligned with the installed harness.
2. Run `predit doctor --profile paid-demo --json` and `predit ls tools --json`, then summarize what is ready, what needs env vars, what needs CLI login, and which composition runtimes are available. If env vars are missing, point the user at the scaffolded `.env` file and the committed `.env.example`; shell exports are also valid and win over file values.
3. For a broad first-video request, make the first deliverable a zero-key personalized idea reel unless the user has already chosen a different format. Use only safe context the user has shared in this session or project. Do not infer or reveal sensitive personal attributes. Offer exactly three specific video ideas, then pick the strongest one if the user asked you to proceed without another choice.
4. Run `predit ls starters` and recommend one starter or one pipeline based on the user's goal.
5. If Remotion or HyperFrames is unavailable and the video would benefit from motion graphics, animated overlays, or runtime choice, ask whether to run `predit setup runtimes` before scaffolding. Run it only after approval; FFmpeg-only is still valid when the user wants the fastest path.
6. If the project has no show yet, scaffold one with `predit new show <slug> --from <starter>` for starter-backed work, or `predit new show <slug> --pipelines <pipeline>` for a custom show.
7. Create or select an episode with `predit new episode <show> <episode>`.
8. For a zero-key personalized idea reel, use the `music-video` starter and rewrite `shows/<show>/inputs/<episode>/lyrics.txt` into four short visible card lines: a tailored hook, idea 1, idea 2, and the next step. Then run `predit build <show>/<episode> --sample`.
9. Before spending provider credits, explain the selected pipeline, likely tools, rough cost, and expected output path.
10. Run `predit build <show>/<episode> --sample --provider-profile paid-demo` for paid samples, or omit the provider profile for zero-key samples.
11. Export with `predit export <show>/<episode> --target premiere` and, when useful, `predit export <show>/<episode> --format edl`.

Record any issue, confusing output, failed tool call, or manual fix in `projects/<show>/<episode>/notes.md` so a coding agent can improve the harness later.

## Communication modes

Match the user's comfort level without changing the production contract:

- **Non-technical user:** use plain language first. Say which account, app, or login step is needed, what it unlocks, and whether it costs money. Avoid YAML explanations unless they ask.
- **Technical user:** include exact commands, env var names, file paths, and failure output. Keep secrets redacted.
- **Agent user:** prefer `--json` commands, record reproducible notes in `projects/<show>/<episode>/notes.md`, do not print secret values, and ask before installs, paid calls, or runtime changes.

## Where things live

```
<this project>/
├── shows/<show>/                  # user content — shows, characters, brand, episodes
│   ├── show.yaml
│   ├── episodes/<slug>.yaml
│   ├── brand/
│   ├── characters/<name>/
│   └── skills/                    # optional: show-specific skill overrides
├── playbooks/                     # optional: project-local playbook overrides
├── pipelines/                     # optional: project-local pipeline overrides
├── skills/                        # optional: project-local skill overrides
├── music_library/                 # gitignored — drop audio here
├── projects/<show>/<episode>/     # gitignored — runtime workspace, generated assets, renders
├── exports/                       # gitignored — editor handoff packages
├── .env                           # gitignored — local provider keys
├── .env.example                   # committed — blank provider key template
└── .predit/                       # gitignored — bundled cache (read-only)
    ├── pipelines/
    ├── playbooks/
    ├── skills/
    └── schemas/
```

`predit` loads `.env`, `.env.<command>`, and `.env.local` from the project root before commands run. Shell-exported values win over file values. Never commit `.env`. Commit `.env.example`, shows, pipelines, playbooks, and skills so workflows can be shared safely.

`predit setup runtimes` installs Remotion and HyperFrames locally for this project. Offer it when those runtimes are unavailable and the user's video would benefit from richer composition, but do not run installs without approval.

When resolving any resource (pipeline, playbook, skill, schema), check the project-local path first, then `.predit/`. Project-local always wins. For director skills, also check `shows/<show>/skills/` before either.

## Operating principles

- **Announce before paid execution.** Before any paid generation call, state the tool, provider, model, reason, and whether it is sample or batch. The user is never surprised by a charge.
- **Sample-first for any production over $0.50 or 15 minutes.** Render a 15–20 second sample end-to-end before committing to the full run.
- **Master clock is sacred.** For audio-led pipelines, scenes snap to musical structure (sections, beats, climax). For VO-led pipelines, scenes snap to voiceover structure. Visual cadence never overrides the master clock.
- **Present both composition runtimes** when both Remotion and HyperFrames are available. Recommend one with rationale; never silently default.
- **Self-review every stage.** Before checkpointing, run the reviewer pass against the stage's `review_focus` and `success_criteria`. Findings must be accurate, complete, and constructive. Critical findings must carry a proposed fix.
- **Log every material decision.** Provider, model, runtime, playbook, music, voice — every meaningful choice goes in the decision log with rejected alternatives and a real reason.
- **No unilateral substitutions.** If the approved path is blocked, prepare alternatives and surface them; do not execute substitutes without user approval.
- **Stop before publishing on failure.** A failing final self-review halts the pipeline. The user sees the issues before the file does.

## Meta skills you must internalize

The bundled cache contains the meta skills that govern these protocols. Read them when relevant:

- `.predit/skills/meta/onboarding.md` — first-contact discovery and capability presentation.
- `.predit/skills/meta/reviewer.md` — the self-review protocol with the CHAI rules.
- `.predit/skills/meta/checkpoint-protocol.md` — when and how to checkpoint, resume, approve.
- `.predit/skills/meta/decision-log.md` — the audit trail of material choices.
- `.predit/skills/meta/announce-and-escalate.md` — what to say before acting and what to say when blocked.
- `.predit/skills/meta/self-review-of-output.md` — the final pass on the rendered file before presenting to the user.

These skills are not optional — they encode the contract that makes `predit` produce coherent, honest output instead of a black-box rendering pipeline.

## Common commands

```bash
predit doctor                              # capability menu — run before any creative work
predit doctor --profile paid-demo --json   # machine-readable provider preflight for agents
predit new show <slug> --from <starter>    # scaffold a new show
predit new show <slug> --pipelines <list>  # scaffold a show bound to existing pipelines
predit new episode <show> [<slug>]         # scaffold a new episode
predit new pipeline <slug>                 # scaffold a project-local pipeline + idea director skill
predit build <show>/<episode>              # run the pipeline interactively
predit build <show>/<episode> --sample     # 15–20s end-to-end sample run
predit resume <show>/<episode>             # pick up at next checkpoint
predit approve <show>/<episode>            # advance past awaiting_human (non-interactive)
predit revise <show>/<episode> "<note>"    # loop the current stage with revision notes
predit export <show>/<episode> --target premiere|davinci|capcut  # NLE handoff
predit export <show>/<episode> --format edl        # raw CMX 3600 EDL
predit ls pipelines | playbooks | tools | starters | shows
predit ls tools --json                    # machine-readable tool availability + install hints
predit setup runtimes                     # install Remotion + HyperFrames locally after approval
predit update                              # refresh .predit/ cache from the installed harness
```

## What not to do

- Do not skip the pipeline.
- Do not call generation tools without reading their Layer 3 vendor skill.
- Do not begin asset generation before user approval on the production plan.
- Do not change provider, model, or render runtime without telling the user and getting approval.
- Do not silently downgrade motion-led briefs to still-led output.
- Do not edit anything inside `.predit/` by hand — it is a cache. Override by placing same-named files in the project-local paths (`./pipelines/`, `./skills/`, etc.).
