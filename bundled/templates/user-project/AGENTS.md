# Agent operating contract — Show Sidekick user project

This is a Show Sidekick user project. The CLI is installed globally (or runnable via `npx -y show-sidekick@latest`). The folder you are in owns the shows, episodes, brand assets, characters, and runtime workspace. The harness — pipelines, playbooks, skills, schemas, starter shows — is bundled with the installed CLI and mirrored locally in `.show-sidekick/` for you to read.

You are the production intelligence. The CLI is the orchestration shell. Skills (Markdown) tell you how to do the creative work. Tools (called via the CLI / registry) carry out concrete actions. This file is your operating contract.

Treat this user-project folder as canonical for production work. Do not edit anything inside `.show-sidekick/`; it is a bundled cache refreshed by the CLI. When validating local harness changes from a checkout, follow the CLI/user-project model in `docs/demo-readiness.md#operating-models`.

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
2. The user's request. If it is vague or exploratory, run the onboarding flow described in `.show-sidekick/skills/meta/onboarding.md`. If it is specific and actionable, go straight to pipeline selection.
3. The pipeline's manifest (`.show-sidekick/pipelines/<pipeline>.yaml` or `./pipelines/<pipeline>.yaml` if overridden locally).
4. The director skill for the stage you are about to run (`.show-sidekick/skills/pipelines/<pipeline>/<stage>-director.md`, or the local / show-level override if one exists).
5. The Layer 3 vendor skill for every generation tool you are about to call (`.show-sidekick/skills/agents/<vendor>/SKILL.md`, with `.agents/skills/<vendor>/SKILL.md` and `.claude/skills/<vendor>/SKILL.md` generated as native agent-discovery mirrors).

## First-run flow for agents

When a user says "help me make the first video", "what can this project do?", or gives a broad creative goal, guide them through this path:

1. Run `showkick update --check --json`. If the bundled cache is stale or missing, run `showkick update` before reading `.show-sidekick/` skills, pipelines, playbooks, schemas, or starters. This keeps the project-local agent instructions aligned with the installed harness.
2. Run `showkick doctor --profile paid-demo --json` and `showkick ls tools --json`, then summarize what is ready, what needs env vars, what needs CLI login, and which composition runtimes are available. If env vars are missing, point the user at the scaffolded `.env` file and the committed `.env.example`; shell exports are also valid and win over file values.
3. For a broad first-video request, ask one short question before proposing: "What do you do, and what kind of videos would be useful for you?" Use only safe context the user answers with in this session or project. Do not infer or reveal sensitive personal attributes. Offer exactly three specific video ideas, then pick the strongest one if the user asked you to proceed without another choice.
4. Run `showkick ls starters` and recommend one starter or one pipeline based on the user's goal. For the default first run, use `animated-explainer` so the output is a narrated motion-graphics explainer, not a music-video smoke test.
5. If Remotion or HyperFrames is unavailable and the video would benefit from motion graphics, animated overlays, or runtime choice, explain that runtime setup may have been skipped or blocked by missing npm. Ask before installing system-level prerequisites such as Node/npm; after approval, run `showkick setup runtimes`. The default first-video path uses Remotion when available and falls back only when the runtime is unavailable.
6. Treat Python and uv as optional tool runtimes for specialized providers or local analysis, not prerequisites for the first no-key video. Mention them only when `showkick ls tools --json` reports a missing Python-backed tool the selected workflow actually needs.
7. If the project has no show yet, scaffold one with `showkick new show <slug> --from <starter>` for starter-backed work, or `showkick new show <slug> --pipelines <pipeline>` for a custom show.
8. Create or select an episode with `showkick new episode <show> <episode>`.
9. When the user provides a PDF, PPTX, audio file, source video, image, or folder of materials, prefer `showkick new episode <show> <episode> --from <path>` so the source is copied into `inputs/<show>/<episode>/` and the episode YAML points at it. Use `showkick import <path> --as <show>/<episode>` only for shows with explicit recurring ingest rules.
10. For a zero-key personalized first video, use the `animated-explainer` starter and rewrite `shows/<show>/inputs/<episode>/script.txt` into four concise narrated scene lines: a tailored hook, one personal-use beat, one workflow beat, and the next step. Keep `duration_s: 30`. Then run `showkick build <show>/<episode> --sample`.
11. Before spending provider credits, explain the selected pipeline, likely tools, rough cost, and expected output path.
12. Run `showkick build <show>/<episode> --sample --provider-profile paid-demo` for paid samples, or omit the provider profile for zero-key samples.
13. Export with `showkick export <show>/<episode> --target premiere` and, when useful, `showkick export <show>/<episode> --format edl`.

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
├── inputs/<show>/<episode>/       # gitignored — local source media/docs copied by --from
├── music_library/                 # gitignored — legacy/shared music drop zone
├── projects/<show>/<episode>/     # gitignored — runtime workspace, generated assets, renders
├── exports/                       # gitignored — editor handoff packages
├── .env                           # gitignored — local provider keys
├── .env.example                   # committed — blank provider key template
├── .agents/skills/                 # gitignored — generated Codex-style Layer 3 skill mirror
├── .claude/skills/                 # gitignored — generated Claude-style Layer 3 skill mirror
└── .show-sidekick/                       # gitignored — bundled cache (read-only)
    ├── pipelines/
    ├── playbooks/
    ├── skills/
    └── schemas/
```

Show Sidekick loads `.env`, `.env.<command>`, and `.env.local` from the project root before commands run. Shell-exported values win over file values. Never commit `.env`. Commit `.env.example`, shows, pipelines, playbooks, and skills so workflows can be shared safely.

`showkick init` installs Remotion, the Remotion CLI, aligned Remotion support deps, and HyperFrames locally for this project by default when npm is available. `showkick setup runtimes` repairs or adds those dependencies later if setup was skipped or blocked. Ask before installing system-level prerequisites such as Node/npm; project-local npm dependencies are expected during init unless the user passed `--no-setup-runtimes`.

When resolving any resource (pipeline, playbook, skill, schema), check the project-local path first, then `.show-sidekick/`. Project-local always wins. For director skills, also check `shows/<show>/skills/` before either.

## Operating principles

- **Announce before paid execution.** Before any paid generation call, state the tool, provider, model, reason, and whether it is sample or batch. The user is never surprised by a charge.
- **Sample-first for any production over $0.50 or 15 minutes.** Render a 15–20 second sample end-to-end before committing to the full run.
- **Master clock is sacred.** For audio-led pipelines, scenes snap to musical structure (sections, beats, climax). For VO-led pipelines, scenes snap to voiceover structure. Visual cadence never overrides the master clock.
- **Present both composition runtimes** when both Remotion and HyperFrames are available. Recommend one with rationale; never silently default.
- **Self-review every stage.** Before checkpointing, run the reviewer pass against the stage's `review_focus` and `success_criteria`. Findings must be accurate, complete, and constructive. Critical findings must carry a proposed fix.
- **Log every material decision.** Provider, model, runtime, playbook, music, voice — every meaningful choice goes in the decision log with rejected alternatives and a real reason.
- **No unilateral substitutions.** If the approved path is blocked, prepare alternatives and surface them; do not execute substitutes without user approval.
- **Validate source references before generation.** If a declared source/reference image cannot be read as real image bytes, stop before paid generation and ask for a fresh file or explicit approval to continue without it.
- **Composition runtimes are not provider substitutes.** Remotion, HyperFrames, and ffmpeg compose approved assets; they do not replace OpenAI/Higgsfield generation when a provider-backed motion path was selected.
- **Stop before publishing on failure.** A failing final self-review halts the pipeline. The user sees the issues before the file does.

## Meta skills you must internalize

The bundled cache contains the meta skills that govern these protocols. Read them when relevant:

- `.show-sidekick/skills/meta/onboarding.md` — first-contact discovery and capability presentation.
- `.show-sidekick/skills/meta/reviewer.md` — the self-review protocol with the CHAI rules.
- `.show-sidekick/skills/meta/checkpoint-protocol.md` — when and how to checkpoint, resume, approve.
- `.show-sidekick/skills/meta/decision-log.md` — the audit trail of material choices.
- `.show-sidekick/skills/meta/announce-and-escalate.md` — what to say before acting and what to say when blocked.
- `.show-sidekick/skills/meta/self-review-of-output.md` — the final pass on the rendered file before presenting to the user.

These skills are not optional — they encode the contract that makes Show Sidekick produce coherent, honest output instead of a black-box rendering pipeline.

## Common commands

```bash
showkick doctor                              # capability menu — run before any creative work
showkick doctor --profile paid-demo --json   # machine-readable provider preflight for agents
showkick new show <slug> --from <starter>    # scaffold a new show
showkick new show <slug> --pipelines <list>  # scaffold a show bound to existing pipelines
showkick new episode <show> [<slug>]         # scaffold a new episode
showkick new episode <show> <slug> --from <path>  # copy source media/docs into inputs/<show>/<episode>/
showkick new pipeline <slug>                 # scaffold a project-local pipeline + idea director skill
showkick build <show>/<episode>              # run the pipeline interactively
showkick build <show>/<episode> --sample     # 15–20s end-to-end sample run
showkick resume <show>/<episode>             # pick up at next checkpoint
showkick approve <show>/<episode>            # advance past awaiting_human (non-interactive)
showkick revise <show>/<episode> "<note>"    # loop the current stage with revision notes
showkick export <show>/<episode> --target premiere|davinci|capcut  # NLE handoff
showkick export <show>/<episode> --format edl        # raw CMX 3600 EDL
showkick ls pipelines | playbooks | tools | starters | shows
showkick ls tools --json                    # machine-readable tool availability + install hints
showkick setup runtimes                     # install Remotion + HyperFrames locally after approval
showkick update                              # refresh .show-sidekick/ cache from the installed harness
```

## What not to do

- Do not skip the pipeline.
- Do not call generation tools without reading their Layer 3 vendor skill.
- Do not begin asset generation before user approval on the production plan.
- Do not change provider, model, or render runtime without telling the user and getting approval.
- Do not silently downgrade motion-led briefs to still-led output.
- Do not edit anything inside `.show-sidekick/` by hand — it is a cache. Override by placing same-named files in the project-local paths (`./pipelines/`, `./skills/`, etc.).
