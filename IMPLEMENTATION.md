# predit — Implementation Guide

This document is the authoritative work plan for building `predit`. It enumerates every epic and issue needed to reach feature-complete v0.1.0, with acceptance criteria each issue must satisfy.

Each issue is **standalone**, **agent-testable**, and **traceable** via its ID (`<EPIC>-<n>`). Issues are intentionally written so that a fresh agent session can pick one up and implement it by reading only this guide and the specs in `specs/`.

## How to use this guide

- **Epics** group related issues. There are no milestones — epics are the unit of organization.
- **Issues** are the unit of work. Each has a summary, description, and acceptance criteria.
- **Acceptance criteria** are testable. An issue is done when every checkbox can be verified by inspection, by a test, or by a documented manual procedure.
- **Cross-references** use issue IDs (`FND-1`, `REG-3`, etc.). Spec references use `specs/<NN>-<slug>.md`.
- **Dependencies** are noted explicitly when an issue cannot start until another is complete.
- The `bundled/` directory referenced throughout is the harness's shipped content (pipelines, playbooks, skills, schemas, starters). At install time, `predit init` mirrors this into the user project's gitignored `.predit/` cache.

## Tier ordering (recommended sequence)

| Tier | Epics | Purpose |
|---|---|---|
| 1 — Foundation | FND, REG, SHW, PIP, CHK | Nothing else compiles without these |
| 2 — Orchestration | REV, DEC, ACT, AUD, FNL, MET, COR | The agent-driven production protocols |
| 3 — Content | L2P, L3V, PBK | Bundled instructions the agent reads at runtime |
| 4 — Capability tools | ANL, COM, IMG, VID, STK, TTS, MUS, AUX, AVT, ENH, CHR, CAP | The concrete tools the agent calls |
| 5 — Delivery | EXP, UPL, STR, CST, REF, CI, DOC | User-facing features and release prep |

---

# Epic FND — Foundation

Scaffold the project so every other epic has a place to land.

## FND-1 — Project scaffolding

**Summary.** Bootstrap the `src/` tree, install dev dependencies, and prove the toolchain works.

**Description.** Create the initial `src/` layout with placeholder index files for every subsystem area (`harness/`, `registry/`, `tools/`, `audio/`, `shows/`, `checkpoints/`, `decisions/`, `cli/`, `remotion/`). Install dependencies declared in `package.json` via pnpm. Add a `src/cli/index.ts` that prints `"predit v0.0.0"` when invoked.

**Acceptance criteria.**
- [ ] `pnpm install` succeeds.
- [ ] `pnpm typecheck` passes on the placeholder tree.
- [ ] `pnpm build` produces a `dist/` with a runnable `dist/cli/index.js`.
- [ ] `node dist/cli/index.js` prints `"predit v0.0.0"` and exits 0.
- [ ] `pnpm test` succeeds (no tests yet, exit 0 OK).

## FND-2 — CLI skeleton with Commander

**Summary.** Establish the `predit <verb>` command surface using Commander.

**Description.** Wire Commander as the CLI framework. Define top-level commands (`init`, `doctor`, `new`, `build`, `resume`, `status`, `approve`, `revise`, `ls`, `show`, `export`, `import`, `watch`, `setup`, `tools`, `update`) as stubs that print a message and exit 0. Implement global flags (`--json`, `--dry-run`, `--verbose`, `--no-color`, `--config`) at the program level.

**Acceptance criteria.**
- [ ] `predit --help` lists every command from `specs/03-cli.md`.
- [ ] Every command has a stub handler that respects `--json` (NDJSON output) vs human-readable output.
- [ ] Unknown commands exit non-zero with a useful suggestion.
- [ ] `--verbose` enables a debug log channel that prints tool calls and decisions to stderr.

## FND-3 — Config and schema utilities

**Summary.** Provide a typed loader for YAML / JSON files validated by Zod schemas.

**Description.** Build `src/config/loader.ts` exposing `loadYaml<T>(path, schema)` and `loadJson<T>(path, schema)` helpers that read a file, parse it, validate against a provided Zod schema, and return the typed value (or throw a structured `ConfigError` with file path, line, and the Zod issue list).

**Acceptance criteria.**
- [ ] Loader returns typed values when the file matches the schema.
- [ ] Loader throws `ConfigError` (not Zod's default error) with file path and human-readable issue list on mismatch.
- [ ] Unit tests cover happy path, missing file, malformed YAML, schema violation.

## FND-4 — Logging primitives

**Summary.** Provide a small structured logger usable across the harness.

**Description.** Implement `src/log/logger.ts` exposing `info`, `warn`, `error`, `debug`, and `event(name, payload)` methods. Honor `--verbose` and `--no-color` globals. `--json` mode emits NDJSON events to stdout; human mode pretty-prints with picocolors.

**Acceptance criteria.**
- [ ] All log methods can be called from any subsystem without circular import issues.
- [ ] `--json` produces parseable NDJSON on stdout; human-readable output goes to stderr in JSON mode.
- [ ] Color is stripped when `--no-color` is set or `process.stdout.isTTY` is false.

## FND-5 — Test infrastructure

**Summary.** Vitest configured with a sample test that exercises the build.

**Description.** Add `vitest.config.ts`, ensure `pnpm test` runs the suite, and seed `src/cli/index.test.ts` that invokes the CLI as a child process and asserts on the version output.

**Acceptance criteria.**
- [ ] `pnpm test` runs and reports at least one passing test.
- [ ] `pnpm test:watch` works for iterative TDD.
- [ ] CI can pick up the test command (used by `CI-1`).

## FND-6 — Filesystem and path resolution

**Summary.** Cwd-aware path helpers that resolve user-project paths and the `.predit/` cache.

**Description.** Implement `src/paths/project.ts` that locates the nearest user project root (walking up the cwd looking for `CLAUDE.md` + `.predit/`), provides absolute paths to `shows/`, `pipelines/`, `playbooks/`, `skills/`, `.predit/`, `projects/`, `music_library/`, and computes show/episode addressing (`<show>/<episode>` → file paths).

**Acceptance criteria.**
- [ ] `findProjectRoot(cwd)` returns the nearest project root or throws a structured error.
- [ ] `resolve(kind, name)` checks local-override path then `.predit/` cache (per `specs/08-skills.md` resolution rules).
- [ ] Tests cover: project root in cwd, project root in ancestor, no project root in any ancestor.

## FND-7 — Environment loading

**Summary.** Load `.env` files at startup with reasonable precedence.

**Description.** On every command, load env vars from `.env.local`, `.env.<command>`, then `.env` (later wins). Process env always overrides files. Expose `requireEnv(name)` and `optionalEnv(name)` helpers used by tool integrations declaring `Integration.kind === 'api'`.

**Acceptance criteria.**
- [ ] `.env.local` overrides `.env`.
- [ ] Process env overrides both files.
- [ ] `requireEnv('FOO')` throws if not present; `optionalEnv('FOO')` returns `undefined`.

---

# Epic REG — Tool Registry

The registry that mediates every tool call. Depends on FND-3 (Zod) and FND-6 (paths).

## REG-1 — Tool interface and `defineTool` helper

**Summary.** The canonical `Tool` shape and a typed helper that authors a tool in one expression.

**Description.** Implement `src/registry/tool.ts` exporting the `Tool<I, O>` interface from `specs/06-tool-registry.md`, plus a `defineTool({...})` helper that preserves input/output type inference via Zod.

**Acceptance criteria.**
- [ ] `defineTool` infers `Tool<I, O>` from the supplied Zod schemas.
- [ ] A sample tool compiles without explicit type annotations beyond schemas.
- [ ] The interface includes `name`, `capability`, `provider`, `status`, `integration`, `best_for`, `supports`, `cost`, `agent_skills`, `input`, `output`, `isAvailable`, `execute`.

## REG-2 — `Integration` discriminated union

**Summary.** First-class types for the four integration kinds: CLI, API, binary, library.

**Description.** Define the `Integration` discriminated union and its helpers (`CliAuth` modes: `cli-login`, `env`, `none`). Implement availability detectors per kind: `which`-based binary detection, env-var presence, CLI auth probe (e.g. `higgsfield whoami`).

**Acceptance criteria.**
- [ ] Each `Integration.kind` has a corresponding `isAvailable()` implementation.
- [ ] CLI auth probe shells out to the declared `check` command and treats non-zero exit as "not authenticated."
- [ ] Library kind uses `require.resolve` and treats `Error: Cannot find module` as unavailable.
- [ ] Unit tests cover available / unavailable / partial-config cases.

## REG-3 — Registry discovery

**Summary.** Glob `src/tools/**/*.ts` and register every default-exported tool.

**Description.** Implement `Registry.discover()` that imports every TS file under `src/tools/`, validates each default export is a `Tool`, indexes by `name`, `capability`, and `provider`. Detect duplicate names and reject with a useful error.

**Acceptance criteria.**
- [ ] After `discover()`, `registry.get(name)`, `byCapability(cap)`, `byProvider(provider)` return correctly typed results.
- [ ] Duplicate names cause a fatal startup error.
- [ ] Tools missing required fields (e.g. no `integration`) cause a fatal startup error.

## REG-4 — `registry.select()` routing

**Summary.** Choose the best tool for a capability based on availability and preferences.

**Description.** Implement `registry.select(cap, prefs?)` that orders candidates by (1) user preference list, (2) configured availability, (3) registry discovery order. Returns the highest-ranked available tool. Throws `NoToolAvailable` if no candidate is available.

**Acceptance criteria.**
- [ ] `select('tts', { prefer: ['elevenlabs', 'piper'] })` returns elevenlabs when available, else piper.
- [ ] `select('image_generation')` with no prefs returns any available tool by registry order.
- [ ] `NoToolAvailable` includes the unavailable candidates and their `Availability.reason`.

## REG-5 — Availability checks integrated end-to-end

**Summary.** A single `registry.refreshAvailability()` pass that probes every registered tool.

**Description.** Implement an async availability pass that runs `isAvailable()` on every tool with reasonable concurrency. Cache the result for the lifetime of a CLI invocation. Emit structured log events for failed probes (`--verbose` shows them).

**Acceptance criteria.**
- [ ] All tools are probed in parallel with a reasonable concurrency cap (e.g. 8).
- [ ] CLI probes timeout after a configurable bound (default 3s).
- [ ] Probe failures are caught and converted to `available: false` with a `reason`.

## REG-6 — Capability menu summary

**Summary.** A `menuSummary()` that produces the human-readable rollup `X of Y configured`.

**Description.** For each capability, count `available / total` tools, list providers, surface unavailable tools' install instructions. The summary is consumed by `predit doctor` and by the onboarding skill.

**Acceptance criteria.**
- [ ] Output shape matches the format in `specs/16-onboarding-and-discovery.md` Step 3.
- [ ] Counts are accurate against a fixture set of tools.
- [ ] `setupOffers()` groups offers by env-var (one offer per env var, regardless of how many tools it unlocks) and by `cli-login`.

## REG-7 — Runtime warnings

**Summary.** Detect environment problems that prevent tools from running.

**Description.** Each tool may declare a `warnings()` hook returning structured strings (e.g. "node version < 22 detected"). Aggregate in `registry.warnings()` and show them in `predit doctor` and at the top of any production command.

**Acceptance criteria.**
- [ ] Warnings surface in `predit doctor` output.
- [ ] Warnings surface as a prefix block in `predit build` runs (and again as JSON events under `--json`).

## REG-8 — `predit doctor` command

**Summary.** The capability menu rendered to the terminal (human + JSON modes).

**Description.** Wire the `doctor` command in the CLI to `registry.refreshAvailability()` then `menuSummary()` + `setupOffers()` + `warnings()`. Human mode renders a colored summary; `--json` emits NDJSON events for each section.

**Acceptance criteria.**
- [ ] Running `predit doctor` against an empty environment shows zero-key tier.
- [ ] After setting an env var that unlocks a tool, re-running `predit doctor` reflects it.
- [ ] `--json` emits valid NDJSON with one event per capability, plus setup offers and warnings.

## REG-9 — `predit setup <tool>` command

**Summary.** Shell out to the tool's native install/login command.

**Description.** Read the tool's `integration.install` string and run it in the user's terminal (passing through stdio). For `cli-login` tools, also run the `auth.check` command afterward to confirm success. Never collect credentials.

**Acceptance criteria.**
- [ ] `predit setup higgsfield` (with a fixture tool) runs the declared install command.
- [ ] After install/login, predit re-probes availability and confirms the tool is now available.
- [ ] Predit does not write to any credential store of its own.

## REG-10 — `predit tools <name>` command

**Summary.** Print full detail for a specific tool: integration kind, install steps, cost, supports, Layer 3 skills.

**Description.** Look up the tool by name, format its declaration in human-readable form, and print. Useful for the agent answering "what does this tool do?" without reading TS source.

**Acceptance criteria.**
- [ ] Shows all declared fields, with a `Read these skills:` block listing `agent_skills`.
- [ ] Unknown tool name exits non-zero with a fuzzy-match suggestion ("did you mean ...").

---

# Epic SHW — Shows and Episodes

Loading and resolving the user's authored content. Depends on FND-3, FND-6.

## SHW-1 — `show.yaml` Zod schema

**Summary.** Validate the show manifest per `specs/04-shows-and-episodes.md`.

**Description.** Express the show schema in Zod: `slug`, `display_name`, `description`, `created`, `defaults`, `brand`, `characters`, `skills`, `playbook_overrides`, `ingest`, `export`.

**Acceptance criteria.**
- [ ] Valid examples parse; invalid examples (missing required fields, wrong types) fail with helpful errors.
- [ ] Zod-inferred TypeScript type is exported as `Show`.

## SHW-2 — `episode.yaml` Zod schema

**Summary.** Validate the episode manifest.

**Description.** Express the episode schema: `slug`, `title`, `created`, `pipeline`, `playbook`, `runtime`, `aspect`, `budget_usd`, `inputs`, `cast`, `tags`. All fields except `slug` and `inputs` are optional (defaults come from `show.yaml`).

**Acceptance criteria.**
- [ ] Schema honors the "anything omitted falls back to show defaults" rule via optionals.
- [ ] Inferred type exported as `Episode`.

## SHW-3 — Deep-merge utility

**Summary.** A typed deep-merge that implements predit's semantics (objects merge by key, arrays replace, `null` removes).

**Description.** Implement `deepMerge(base, overrides)` with the rules from `specs/04-shows-and-episodes.md`. Used to merge pipeline → playbook → show.playbook_overrides → episode.

**Acceptance criteria.**
- [ ] Arrays replace (not concatenate).
- [ ] Objects merge by key.
- [ ] `null` in override deletes the key from the result.
- [ ] Test fixtures cover nested objects, arrays, mixed cases.

## SHW-4 — Show loader

**Summary.** Locate and load a show by slug.

**Description.** Given a project root and a show slug, load `shows/<slug>/show.yaml`, parse with SHW-1, return a typed Show. Resolve `brand`, `characters`, `skills`, `playbook_overrides` paths to absolute paths.

**Acceptance criteria.**
- [ ] Returns a Show with absolute paths.
- [ ] Missing `show.yaml` throws a structured error mentioning the expected path.

## SHW-5 — Episode loader

**Summary.** Locate and load an episode within a show.

**Description.** Given a show + an episode slug, load `shows/<show>/episodes/<slug>.yaml`. Resolve inputs relative to project root.

**Acceptance criteria.**
- [ ] Returns an Episode with absolute input paths.
- [ ] Missing input files are reported with a clear message (`inputs.track: file not found at <path>`).

## SHW-6 — Resolution order

**Summary.** Compose pipeline + playbook + show overrides + episode into a single resolved context.

**Description.** Implement `resolveContext({ show, episode })` that produces a `ResolvedContext` containing the merged configuration the harness uses for the run. Order: pipeline manifest → playbook → show.playbook_overrides → episode overrides.

**Acceptance criteria.**
- [ ] Resolved context contains the effective values from every layer.
- [ ] Tests cover override scenarios across all four layers.

## SHW-7 — Character resolution

**Summary.** Resolve `episode.cast` slugs to per-character directories.

**Description.** For each slug in `episode.cast`, look up `shows/<show>/characters/<slug>/character.yaml` and return the typed character info (voice_id, visual description, persona, references[]).

**Acceptance criteria.**
- [ ] Returns full character info per slug.
- [ ] Missing character throws with the expected path.
- [ ] Schema validates character.yaml.

## SHW-8 — Skill resolver

**Summary.** Three-tier skill lookup: show override > project override > bundled cache.

**Description.** Implement `resolveSkill(kind, name, ctx)` per `specs/08-skills.md` resolution rules. Used for director skills, meta skills, vendor skills.

**Acceptance criteria.**
- [ ] Returns the first match in the documented priority order.
- [ ] Returns the resolved absolute path AND the file contents (cached).
- [ ] Throws when none of the three locations have the skill.

## SHW-9 — `predit ls` for shows / episodes / pipelines / playbooks / tools / starters

**Summary.** List the things the user has and can use.

**Description.** Implement `ls <kind>` for each kind. Pulls from the user project (shows, episodes) and from the bundled cache + project overrides (pipelines, playbooks, tools, starters).

**Acceptance criteria.**
- [ ] `predit ls shows` returns one row per `shows/<slug>/`.
- [ ] `predit ls episodes <show>` returns episodes under a show.
- [ ] `predit ls pipelines | playbooks | starters` returns merged bundled + project overrides.
- [ ] `predit ls tools` returns tool names + status (from registry).
- [ ] `--json` emits a structured list.

## SHW-10 — `predit new show <slug>` (with optional `--from <starter>`)

**Summary.** Scaffold a new show directory.

**Description.** Create `shows/<slug>/show.yaml` from a default template, optionally cloning a starter from `.predit/starters/<starter>/`. Refuse to overwrite an existing show.

**Acceptance criteria.**
- [ ] New `shows/<slug>/show.yaml` is created with sensible defaults.
- [ ] `--from <starter>` copies brand/, characters/, episode.template.yaml, README.md from the starter.
- [ ] Existing directory triggers an error (no clobbering).

## SHW-11 — `predit new episode <show> [<slug>]`

**Summary.** Scaffold a new episode under a show.

**Description.** Create `shows/<show>/episodes/<slug>.yaml`. If `<slug>` is omitted, prompt or auto-generate from a timestamp. Pull from `shows/<show>/episode.template.yaml` if present.

**Acceptance criteria.**
- [ ] New episode file is created with `slug`, `title`, `created` filled in.
- [ ] Template (if present) is copied and pre-filled.

## SHW-12 — `predit new pipeline <slug>` and `predit new playbook <slug>`

**Summary.** Scaffold a project-local pipeline manifest or playbook stub.

**Description.** Create `pipelines/<slug>.yaml` or `playbooks/<slug>.yaml` from a minimal template, ready for the user to edit. These override the bundled defaults when present.

**Acceptance criteria.**
- [ ] Scaffolded file is valid against its Zod schema.
- [ ] If the slug matches a bundled name, predit warns "this will override the bundled <slug>."

---

# Epic PIP — Pipelines and Harness Runtime

The orchestration core. Depends on REG, SHW, FND.

## PIP-1 — Pipeline manifest loader

**Summary.** Locate, parse, and validate a pipeline manifest by slug.

**Description.** Use the SHW-8 resolver to find the manifest (`pipelines/<slug>.yaml` project-local or `.predit/pipelines/<slug>.yaml` bundled). Parse with the Zod schema from PIP-2.

**Acceptance criteria.**
- [ ] Returns a typed `Pipeline`.
- [ ] Unknown stage names in success_criteria refs trigger validation errors.

## PIP-2 — Pipeline manifest Zod schema

**Summary.** Express the manifest shape per `specs/05-pipelines.md`.

**Description.** Encode top-level fields (`slug`, `display_name`, `description`, `status`, `master_clock`, `defaults`, `stages`, `export`) and the per-stage fields (`slug`, `skill`, `produces`, `tools_available`, `review_focus`, `success_criteria`, `human_approval`, `audio_sync`, `sample_mode_supported`, `estimated_cost`, `requires_runtime`).

**Acceptance criteria.**
- [ ] All fields documented in the spec are typed.
- [ ] `human_approval` is the 3-level enum (`required | optional | never`).
- [ ] `audio_sync` enum is `build | required | none`.

## PIP-3 — Stage execution context

**Summary.** `StageContext` is the typed input the agent receives at each stage.

**Description.** Define `StageContext` containing: resolved show + episode, prior artifacts (loaded from checkpoints), registry handle, cuesheet if relevant, run options (sample, budget). Define `StageResult` containing: artifact, cost_used, decisions, review_summary.

**Acceptance criteria.**
- [ ] Tests construct a fixture context and assert all expected fields are present.

## PIP-4 — Brief artifact schema

**Summary.** Zod schema + JSON schema for the `brief` artifact (idea stage output).

**Description.** Define `Brief` shape: title, audience, platform, tone, duration_s, hook, key_points, notes. Validates the idea stage's canonical output.

**Acceptance criteria.**
- [ ] Zod schema present in `src/artifacts/brief.ts`.
- [ ] JSON schema written to `bundled/schemas/artifacts/brief.schema.json`.

## PIP-5 — Asset manifest artifact schema

**Summary.** Schema for the `asset_manifest` produced by the assets stage.

**Description.** Each entry: `id`, `kind` (image | video | audio | music | narration), `path`, `scene_ref`, `provider`, `model`, `seed`, `prompt`, `cost_usd`.

**Acceptance criteria.**
- [ ] Zod + JSON schema present.
- [ ] Asset path validated as absolute file path.

## PIP-6 — Edit decisions artifact schema

**Summary.** Schema for `edit_decisions` produced by the edit stage.

**Description.** Cuts (start_s, end_s, asset_id, transition), overlays, subtitle config, music config, locked render_runtime.

**Acceptance criteria.**
- [ ] Schema enforces no overlapping cuts.
- [ ] `render_runtime` value validated against the registry's available runtimes when validated in-context.

## PIP-7 — Proposal packet artifact schema

**Summary.** Schema for `proposal_packet` produced by the proposal stage.

**Description.** Concept variants, recommended tool path, alternatives, cost estimate, music plan, delivery_promise, production_plan (including `render_runtime`), reference_alignment (when reference-driven).

**Acceptance criteria.**
- [ ] Schema present.
- [ ] `production_plan.render_runtime` field captured.

## PIP-8 — Render report artifact schema

**Summary.** Schema for `render_report` produced by the compose stage.

**Description.** Output path, encoding profile, duration, resolution, framerate, runtime used, asset count, warnings, verification notes.

**Acceptance criteria.**
- [ ] Schema present.

## PIP-9 — Media profiles

**Summary.** Per-aspect / per-platform output profiles.

**Description.** Profiles like `vertical-9-16`, `horizontal-16-9`, `square-1-1` with resolution, framerate, bitrate, audio profile defaults. Used by compose stage to pick encoder settings.

**Acceptance criteria.**
- [ ] At least 3 profiles defined and selectable by name.
- [ ] Pipelines and episodes can reference a profile by name.

## PIP-10 — Scene plan artifact schema

**Summary.** Schema for `scene_plan` produced by the scene_plan stage.

**Description.** Ordered scenes, each with id, start_s, end_s, hook?, description, asset_requirements, shot_language (size, intent, motion, framing), anchor (section / beat / climax / manual).

**Acceptance criteria.**
- [ ] Schema present.
- [ ] Scene durations sum to a value within ±0.5s of episode duration when validated.

## PIP-11 — Runner state machine

**Summary.** The harness loop that runs stages in order.

**Description.** Implement `Runner.run({show, episode, ...})` per `specs/05-pipelines.md`: load context, plan stages (honor `--from / --to / --only`), for each stage: dispatch to the agent (via stage contract), self-review, checkpoint, approve gate, advance. Handle interactive vs `--non-interactive` modes.

**Acceptance criteria.**
- [ ] A pipeline with all stages set to `human_approval: never` runs end-to-end without prompts.
- [ ] A stage with `human_approval: required` in interactive mode prompts; in `--non-interactive` mode exits with `awaiting_human`.
- [ ] `--from <stage>` skips earlier stages and loads their prior artifacts from checkpoints.
- [ ] `--only <stage>` runs only the named stage.
- [ ] Budget enforcement halts the run when cumulative cost exceeds `--budget`.

## PIP-12 — Stage dispatch contract

**Summary.** A typed protocol for handing control to the agent at each stage.

**Description.** Define the interface the runner uses to invoke an agent for a stage. The agent receives `StageContext`, returns `StageResult`. The implementation may be in-process (a stub that reads canned artifacts for tests) or external (an LLM agent driving via CLI).

**Acceptance criteria.**
- [ ] In-process stub returns deterministic fixtures for tests.
- [ ] External agent interface emits an event the harness can wait on.

## PIP-13 — Sample-mode flag threading

**Summary.** `--sample` reaches every stage that supports it.

**Description.** Threads `sample: true` into `StageContext.options`. Stages declaring `sample_mode_supported: true` honor it; others ignore. A sample sub-checkpoint is written after compose (see CHK-7).

**Acceptance criteria.**
- [ ] Sample run completes ~10× faster and ~5× cheaper than full run for the framework-smoke pipeline (used as benchmark).
- [ ] Tests verify the sample flag arrives in stage context.

---

# Epic CHK — Checkpoints and Resume

Depends on FND, PIP.

## CHK-1 — Checkpoint Zod schema

**Summary.** Validate per-stage checkpoint files per `specs/12-checkpoint-protocol.md`.

**Description.** Encode `stage`, `status` enum, `timestamp`, `artifact`, `review_summary`, `cost_snapshot`, `tool_invocations`.

**Acceptance criteria.**
- [ ] Schema present in `src/checkpoints/schema.ts` and JSON schema at `bundled/schemas/checkpoints/checkpoint.schema.json`.

## CHK-2 — Checkpoint read/write

**Summary.** Persist and load checkpoints.

**Description.** Write checkpoints to `projects/<show>/<episode>/checkpoints/<stage>.json` atomically (temp + rename). Read with schema validation.

**Acceptance criteria.**
- [ ] Atomic write — interrupted writes never leave a partial file.
- [ ] Reads validate against CHK-1 schema and throw `InvalidCheckpoint` on malformed content.

## CHK-3 — Pipeline state file

**Summary.** `projects/<show>/<episode>/state.json` tracks current stage, cost, last decision.

**Description.** Write a small state file alongside checkpoints. Updated on every stage transition.

**Acceptance criteria.**
- [ ] State file present after the first stage completes.
- [ ] State reflects the latest checkpoint's stage name.

## CHK-4 — Resume protocol

**Summary.** Scan checkpoints to determine the next stage.

**Description.** Implement `getNextStage(projectRoot, show, episode, pipeline)` per `specs/12-checkpoint-protocol.md` resume rules. Handle `completed`, `awaiting_human`, `failed`, `in_progress` states; treat orphaned `in_progress` as crashed.

**Acceptance criteria.**
- [ ] Fresh project: returns first stage.
- [ ] After completed stage N: returns stage N+1.
- [ ] After `awaiting_human` checkpoint: returns the awaiting stage (not the next).
- [ ] After `failed`: surfaces the failure.

## CHK-5 — Human approval presentation

**Summary.** Format the approval block per `specs/12-checkpoint-protocol.md`.

**Description.** Given a checkpoint, render: artifact summary, review findings (counts + critical findings), cost snapshot (this stage + total + remaining), action options. Honest — never hide findings.

**Acceptance criteria.**
- [ ] Output includes every section from the spec.
- [ ] Findings are not silently truncated; critical findings always show fully.

## CHK-6 — `predit approve / revise / status / resume` commands

**Summary.** The user-facing commands that drive checkpoints in `--non-interactive` mode.

**Description.** `approve` advances past `awaiting_human`. `revise "<note>"` re-runs the current stage with the note appended to context. `status` prints the current state. `resume` is `build` without `--from`.

**Acceptance criteria.**
- [ ] All four commands work end-to-end against a fixture run.
- [ ] `--json` emits structured events.

## CHK-7 — Sample sub-checkpoint

**Summary.** A non-stage checkpoint produced after a sample render.

**Description.** Write `projects/<show>/<episode>/checkpoints/sample.json` with the rendered sample path, sample cost, projected full cost, status `awaiting_human`.

**Acceptance criteria.**
- [ ] Sample-mode runs end at the sample checkpoint with the next action awaiting human approval.
- [ ] Approval continues into the full run; revision regenerates the sample.

---

# Epic REV — Reviewer Protocol

Depends on PIP, CHK.

## REV-1 — Review artifact schema

**Summary.** Zod + JSON schema for the per-stage review artifact.

**Description.** Encode `stage`, `round`, `decision` enum, `findings[]` (severity, title, location, description, proposed_fix, status), `summary` counts.

**Acceptance criteria.**
- [ ] Schema present.

## REV-2 — Reviewer runner

**Summary.** Run the reviewer pass against a stage's artifact before checkpointing.

**Description.** Implement `runReview(stage, artifact, ctx) → Review`. Loads `review_focus` and `success_criteria` from the manifest, validates the artifact against its schema, evaluates focus items, applies CHAI rules, returns the Review.

**Acceptance criteria.**
- [ ] A passing artifact returns `decision: 'pass'` with no critical findings.
- [ ] A schema-invalid artifact returns critical.
- [ ] Max 2 rounds is enforced; the third call returns `pass_with_warnings`.

## REV-3 — CHAI enforcement

**Summary.** Enforce Accurate / Complete / Constructive rules on findings.

**Description.** When a reviewer produces a `critical` finding without a `proposed_fix`, downgrade it to `investigation` and log a warning. Pattern-match for "scan the rest of the same class" before returning.

**Acceptance criteria.**
- [ ] Test: critical finding without `proposed_fix` is auto-downgraded.
- [ ] Findings include the `location` field (artifact path or frame timestamp).

## REV-4 — Playbook quality-rules cross-check

**Summary.** When a playbook is active, verify the artifact against its `quality_rules`.

**Description.** Load the resolved playbook and run its quality rules (palette adherence, transition allowlist, pacing min/max). Each violation becomes a `suggestion`.

**Acceptance criteria.**
- [ ] Tests cover palette mismatch, transition outside allowlist, pacing violation.

## REV-5 — Reference alignment review pass

**Summary.** When a reference video brief exists, check grounding, differentiation, and promise preservation.

**Description.** Compare the proposal/script/scene_plan against the reference VideoAnalysisBrief. Hallucinated reference claims → critical. Carbon-copy proposals → critical. User-loved elements missing → suggestion.

**Acceptance criteria.**
- [ ] Tests cover hallucination, carbon-copy, promise loss.

## REV-6 — Delivery promise validator

**Summary.** Validate the produced edit_decisions / render against the proposal's delivery promise.

**Description.** Read `proposal.delivery_promise` and validate cuts (motion ratio for motion-led promises, narration presence, music presence). Used by REV runs at the edit stage and by FNL (final self-review) at compose.

**Acceptance criteria.**
- [ ] Motion-led promise with <50% motion cuts triggers a warning.
- [ ] Dropped narration on a narration-required promise triggers critical.

## REV-7 — Slideshow risk scoring

**Summary.** Heuristic that scores how slideshow-y a scene plan or edit is.

**Description.** Compute a 0-5 score across dimensions: repetition, decorative visuals, weak motion, weak shot intent, typography overreliance, unsupported cinematic claims. Verdict thresholds: ≥4 fail, ≥3 revise.

**Acceptance criteria.**
- [ ] Function `scoreSlideshowRisk(scenes, edit?, rendererFamily)` returns scored dimensions + verdict.
- [ ] At scene_plan stage, fail verdict triggers critical; revise verdict triggers suggestion.

## REV-8 — Source media review enforcement

**Summary.** When user provided source media, require a `source_media_review` artifact before planning.

**Description.** If user inputs include media files, the agent must produce `source_media_review` with probe data per file. Absence at proposal/script stage = critical.

**Acceptance criteria.**
- [ ] Tests cover: user provides media + agent skipped review (critical), user provides media + agent reviewed but probe empty (critical), no user media (no finding).

## REV-9 — Scoring utility module

**Summary.** Shared scoring helpers (min/max, weighted, normalization) used by REV-7 and the variation checker.

**Description.** Pure utility module under `src/review/scoring.ts`.

**Acceptance criteria.**
- [ ] 100% unit-test coverage.

## REV-10 — Variation checker

**Summary.** Catch "every scene looks the same" failures.

**Description.** Score scene variety (shot size distribution, layout repetition, color repetition, motion presence). Verdict: poor (≤2) → critical, fair (≤3) → suggestion.

**Acceptance criteria.**
- [ ] `checkSceneVariation(scenes) → { score, verdict, violations[] }`.
- [ ] Tests with synthetic identical scenes return "poor."

## REV-11 — Scene pacing verifier

**Summary.** Verify scene durations match the pipeline's pacing rules.

**Description.** Check max scene duration, min scene duration, distribution. For music-led pipelines, also verify scenes don't bleed across section boundaries unintentionally.

**Acceptance criteria.**
- [ ] Tests cover a scene exceeding `max_scene_duration_s` (critical) and a scene split across a section boundary (suggestion).

---

# Epic DEC — Decision Log

Depends on PIP, CHK.

## DEC-1 — Decision log Zod + JSON schema

**Summary.** Per `specs/14-decision-log.md`.

**Description.** Entry shape: `id`, `stage`, `timestamp`, `category`, `options_considered[]`, `picked`, `reason`, `confidence`, `user_visible`, `supersedes`.

**Acceptance criteria.**
- [ ] Schema present.

## DEC-2 — Decisions read/write

**Summary.** Persist and load `projects/<show>/<episode>/decisions.json`.

**Description.** Append-only file. Each call to `recordDecision()` appends one entry. Supersede mechanic: prior entries are preserved; the new entry sets `supersedes`.

**Acceptance criteria.**
- [ ] Atomic append.
- [ ] Reads return decisions in insertion order.

## DEC-3 — Decision-log audit

**Summary.** A reviewer pass that checks log coverage.

**Description.** Verify every required category for the current stage has an entry, options_considered has ≥2 items, reasons aren't boilerplate, confidence values are realistic.

**Acceptance criteria.**
- [ ] Missing required category → suggestion (first time) / critical (by edit stage).
- [ ] Single-option-considered → suggestion.
- [ ] All-confidence-1.0 pattern → suggestion.

## DEC-4 — Present-both-runtimes enforcement

**Summary.** When both Remotion and HyperFrames are available, the `runtime` decision must list both.

**Description.** A critical reviewer finding when the runtime decision has only one option considered while the registry shows both runtimes available.

**Acceptance criteria.**
- [ ] Test: both available + single option → critical.
- [ ] Test: only one available + that one listed + the other marked `rejected_because: "runtime not available on this machine"` → no finding.

## DEC-5 — `predit ls decisions <show>/<episode>` command

**Summary.** Show the decision log for an episode.

**Description.** Render the log as a table (human mode) or NDJSON (`--json`).

**Acceptance criteria.**
- [ ] Output includes all entries with id, stage, category, picked, reason, confidence.

---

# Epic ACT — Announce and Escalate

Per `specs/15-announce-and-escalate.md`. Mostly bundled meta skills (under MET); this epic covers the harness-side enforcement.

## ACT-1 — Pre-execution announce protocol

**Summary.** Before every paid tool call, the harness prints an announce block.

**Description.** Wrap every `tool.execute()` for tools with non-zero `cost` with a pre-call announce block: tool, provider, model, reason, sample-or-batch, estimate. In `--non-interactive`, this prints to log but does not prompt.

**Acceptance criteria.**
- [ ] Every paid call emits an announce event.
- [ ] In interactive mode, the user can abort the call from the announce prompt.

## ACT-2 — Major-change gate

**Summary.** Detect material decisions that require explicit approval.

**Description.** Watch for provider swaps, model swaps, runtime swaps, dropped narration/music, sample→batch transitions. Refuse to proceed without explicit user approval and a logged decision (with `supersedes`).

**Acceptance criteria.**
- [ ] A runtime swap between proposal and compose without approval triggers a critical reviewer finding and halts.

## ACT-3 — Structured blocker escalation

**Summary.** When a path is blocked, surface a structured block to the user.

**Description.** Helper `escalateBlocker({attempted, failed, type, options, recommendation})` formats the block per spec 15 and either prompts (interactive) or exits with a structured `awaiting_human` (non-interactive).

**Acceptance criteria.**
- [ ] Test simulates a tool failure and verifies the escalation block.

## ACT-4 — Motion-required guardrail

**Summary.** Refuse silent downgrade from motion-led to still-led.

**Description.** When the proposal locks a motion-led delivery_promise and a downstream stage would produce still-led output, raise a structured blocker. Never substitute silently.

**Acceptance criteria.**
- [ ] Test simulates HyperFrames unavailable + locked motion-led promise + agent tries Remotion fallback → blocker raised before execution.

---

# Epic AUD — Audio Subsystem

Per `specs/07-audio-subsystem.md`. Depends on REG (for whisper.cpp / aubio binary tools).

## AUD-1 — `audio.load()`

**Summary.** Load an audio track via ffmpeg probe.

**Description.** Shell out to `ffprobe -v error -print_format json -show_format -show_streams <path>`. Return typed `AudioTrack` (path, duration_s, sample_rate).

**Acceptance criteria.**
- [ ] Test against a fixture mp3 returns correct duration ±0.1s.

## AUD-2 — `audio.transcribe()` (whisper.cpp backend)

**Summary.** Word-level transcription via whisper.cpp.

**Description.** Shell out to `whisper-cli` with `--output-json --word-thumbnails` (or equivalent). Parse JSON into `Segment[]` with word-level timings.

**Acceptance criteria.**
- [ ] Returns segments with word-level timestamps.
- [ ] Confidence values are populated.
- [ ] Falls back to alternative backends when registered (e.g. ElevenLabs Scribe).

## AUD-3 — `audio.detectSections()`

**Summary.** Detect verse / chorus / bridge / silence sections.

**Description.** Combine ffmpeg `silencedetect` for gap finding, RMS-energy windowing for vocal vs instrumental classification, and transcript hint (presence/absence of words in a window) for further refinement. Return `Section[]` per `specs/07`.

**Acceptance criteria.**
- [ ] Detects ≥3 sections in a fixture song.
- [ ] Section boundaries land within 200 ms of obvious gaps.

## AUD-4 — `audio.detectBeats()` (aubio backend)

**Summary.** Beat grid and BPM via aubio CLI.

**Description.** Shell out to `aubio beat` and `aubio tempo`. Return `{ bpm, beats[] }`. Mark every 4th beat as `is_downbeat: true` (overridable when time signature is known).

**Acceptance criteria.**
- [ ] BPM within ±2 of known fixture value.
- [ ] Beat count consistent with `bpm × duration_min`.

## AUD-5 — `audio.detectClimax()`

**Summary.** Identify peak / drop / arrival / release moments.

**Description.** Compute RMS energy across the track, weight by section length, find local maxima ≥3s apart, classify by surrounding energy curve. Default to algorithm-detected; agent or user can mark `source: 'manual'`.

**Acceptance criteria.**
- [ ] Returns ≥1 ClimaxPoint for a fixture song with an obvious chorus.

## AUD-6 — `audio.alignScenes()`

**Summary.** Snap a scene plan to musical structure.

**Description.** Given a ScenePlan and a Cuesheet, produce `SceneAnchor[]` per `specs/07`. Honor `snap_to`, `align_climax_scene_to`, `max_scene_duration_s`.

**Acceptance criteria.**
- [ ] Every scene gets an anchor.
- [ ] Hero scene lands within 200 ms of the declared climax.
- [ ] No scene exceeds `max_scene_duration_s`.

## AUD-7 — Cuesheet schema and persistence

**Summary.** Zod + JSON schema; persist to `projects/<show>/<episode>/cuesheet.json`.

**Description.** The Cuesheet is the canonical artifact of the cuesheet stage.

**Acceptance criteria.**
- [ ] Schema present; file written.
- [ ] Cuesheet is re-readable and validates.

## AUD-8 — `audio.buildCuesheet()` composer

**Summary.** Compose the cuesheet from primitives.

**Description.** Run transcribe + detectSections + detectBeats + detectClimax (per the requested options) and return the merged Cuesheet.

**Acceptance criteria.**
- [ ] All primitives are called with shared cached track data (no duplicate probes).

## AUD-9 — Cuesheet stage director skill

**Summary.** A reusable director skill for the `cuesheet` stage in audio-led pipelines.

**Description.** Markdown skill at `bundled/skills/pipelines/_shared/cuesheet-director.md`. Instructs the agent on inspecting cuesheet quality, accepting/revising the section labeling, confirming climax placement.

**Acceptance criteria.**
- [ ] Skill is present, frontmatter-validated, and referenced by music-video and trailer pipelines.

## AUD-10 — Local whisper.cpp tool

**Summary.** Register whisper.cpp as a `binary` integration.

**Description.** Tool definition at `src/tools/whisper-cpp.ts`. Detects via PATH probe. Install instructions reference Homebrew or build-from-source.

**Acceptance criteria.**
- [ ] Tool available when `whisper-cli` is on PATH.

## AUD-11 — aubio tool

**Summary.** Register aubio CLI as a `binary` integration.

**Description.** Detects `aubio` on PATH. Install instructions for Homebrew (`brew install aubio`) or apt.

**Acceptance criteria.**
- [ ] Tool available when aubio is on PATH.

## AUD-12 — `predit cuesheet <show>/<episode>` command (utility)

**Summary.** Run the audio subsystem standalone to produce or refresh a cuesheet.

**Description.** Useful for debugging or hand-tweaking. Writes `cuesheet.json` and prints a summary.

**Acceptance criteria.**
- [ ] Command produces a valid cuesheet without running the full pipeline.

---

# Epic FNL — Final Self-Review of Output

Per `specs/17-self-review-of-output.md`. Depends on PIP (compose stage), REV.

## FNL-1 — `final_review` artifact schema

**Summary.** Zod + JSON schema.

**Description.** Encode status, checks (technical_probe, visual_spotcheck, audio_spotcheck, promise_preservation, subtitle_check), issues_found, recommended_action.

**Acceptance criteria.**
- [ ] Schema present.

## FNL-2 — Technical probe and visual spotcheck

**Summary.** Use ffprobe + frame sampling to verify the render.

**Description.** Probe duration/resolution/codecs; sample frames at 10/35/65/90% + hero scene; pass to a visual-QA agent (which inspects the frames) for plausibility.

**Acceptance criteria.**
- [ ] Probe data validates against the proposal's duration ±0.5s and resolution exact match.
- [ ] Sampled frames are saved alongside the final_review artifact for human inspection.

## FNL-3 — Audio spotcheck

**Summary.** Verify audio presence + caption timing.

**Description.** ffprobe audio stream presence + RMS sampling at narration windows + caption sync against word timestamps in cuesheet.

**Acceptance criteria.**
- [ ] Narration window energy > silence threshold.
- [ ] Caption sync within ±150 ms of word timestamps reports ≥95% accuracy.

## FNL-4 — Promise preservation check

**Summary.** Verify the rendered output matches the proposal's delivery_promise.

**Description.** Cross-check render's motion ratio, runtime used, narration/music presence, reference-loved elements (when present).

**Acceptance criteria.**
- [ ] `silent_downgrade_detected: true` when motion-led promise rendered as still-led.
- [ ] `runtime_swap_detected: true` when locked runtime didn't match the actual renderer.

## FNL-5 — Halt-on-fail gate

**Summary.** A failing final_review halts the pipeline.

**Description.** Compose stage cannot present output to the user without `final_review.status === 'pass'`. On `revise`, the harness offers an auto-rerender; on `fail`, the harness halts and surfaces issues.

**Acceptance criteria.**
- [ ] Test simulates a failing self-review and confirms the pipeline halts.

---

# Epic MET — Bundled Meta Skills

Markdown skills shipped at `bundled/skills/meta/*.md`. These are the production agent's brain.

## MET-1 — `onboarding.md`

**Summary.** First-contact discovery and capability presentation.

**Description.** Encode `specs/16-onboarding-and-discovery.md` as an operational skill the agent reads on first interaction.

**Acceptance criteria.**
- [ ] Includes preflight, tier classification, 3 starter prompts per tier, anti-patterns.
- [ ] Frontmatter: `name`, `applies_to: meta`, `triggers: [first-interaction, vague-request]`.

## MET-2 — `creative-intake.md`

**Summary.** Gather user intent through 7 targeted questions, conversationally.

**Description.** Skill that the agent uses after onboarding to refine intent before kicking off research. Distinct from onboarding: onboarding is about capabilities; intake is about purpose, audience, platform, tone, references, outcome, constraints.

**Acceptance criteria.**
- [ ] Includes the 7 required questions, conversational ask rules, how to handle vague vs detailed briefs.
- [ ] Includes the reference-video redirect (when a URL is provided, route to `video-reference-analyst` instead).

## MET-3 — `checkpoint-protocol.md`

**Summary.** Encode the checkpoint contract for the agent.

**Description.** Tells the agent when to checkpoint, what content to include, how to present approval blocks.

**Acceptance criteria.**
- [ ] Matches `specs/12-checkpoint-protocol.md` in protocol; tone is operational.

## MET-4 — `reviewer.md`

**Summary.** The self-review protocol with CHAI rules.

**Description.** The agent's instructions for running its own reviewer pass. Includes severity ladder, two-rounds rule, specialty review passes.

**Acceptance criteria.**
- [ ] Matches `specs/13-reviewer-protocol.md`.
- [ ] Includes the specialty passes (reference alignment, decision log, delivery promise, source media, runtime swap, slideshow risk, variation).

## MET-5 — `decision-log.md`

**Summary.** How to log decisions during a run.

**Description.** Per `specs/14-decision-log.md`. The agent reads this before any major decision.

**Acceptance criteria.**
- [ ] Includes categories, required entries by stage, present-both-runtimes rule.

## MET-6 — `announce-and-escalate.md`

**Summary.** The decision communication contract.

**Description.** Per `specs/15-announce-and-escalate.md`. Operational tone — what to say before acting, what to say when blocked.

**Acceptance criteria.**
- [ ] Includes the full pre-execution announce template and the structured blocker template.

## MET-7 — `animation-runtime-selector.md`

**Summary.** Meta routing for animation library choice.

**Description.** Tells the agent: which composition runtime to use (Remotion / HyperFrames / FFmpeg) and which animation library to reach for (Remotion primitives / GSAP plugins / framer-motion / Lottie / Manim / D3) given the brief.

**Acceptance criteria.**
- [ ] Includes the decision matrix from the spec.
- [ ] Includes the "keep it simple" bias (do Remotion primitives solve this in ≤20 lines?).
- [ ] Includes deterministic-GSAP-inside-Remotion patterns.

## MET-8 — `video-reference-analyst.md`

**Summary.** Reference-driven workflow.

**Description.** When the user provides a video URL or local file as reference, this skill runs the analysis → present brief → capability audit → ask critical questions → lightweight research → 2-3 differentiated proposals → mandatory sample → hard redirect into pipeline.

**Acceptance criteria.**
- [ ] Encodes the 5-aspect breakdown (Subject, Subject Motion, Scene, Spatial Framing, Camera).
- [ ] Includes anti-patterns (no carbon copy, no silent runtime default).

## MET-9 — `skill-creator.md`

**Summary.** How to author a new skill.

**Description.** Used when the agent encounters a reusable gap. Includes the four skill types (stage director / meta / vendor / playbook), the standard skill structure, the key principles (teach thinking, examples, references, self-evaluation rubric, opinions).

**Acceptance criteria.**
- [ ] Includes a skill template with required sections.
- [ ] Includes register-the-skill instructions (placement, index, references).

## MET-10 — `self-review-of-output.md`

**Summary.** The compose-stage final review.

**Description.** Per `specs/17-self-review-of-output.md`. Operational instructions for the agent running the final check.

**Acceptance criteria.**
- [ ] Matches the spec; includes the 5 required checks.

## MET-11 — `capability-extension.md`

**Summary.** The escape hatch when no existing tool covers a need.

**Description.** Strict protocol allowing project-scoped scripts/tools/playbooks/skills under guardrails: idempotent, logged in decision log, user-approved for paid actions, never modify existing tools.

**Acceptance criteria.**
- [ ] Includes the gap-type table (one-off transform / recurring visual / missing provider / missing knowledge).
- [ ] Includes the rules per gap type and the decision-log entry format.

## MET-12 — `executive-producer.md` (template + per-pipeline overrides)

**Summary.** A shared executive-producer pattern.

**Description.** A meta-level skill describing what an executive-producer skill must do (state machine summary, locked decisions, validated patterns, when to stop). Each pipeline ships its own `executive-producer.md` (see L2P epic) that inherits this structure.

**Acceptance criteria.**
- [ ] Template includes pipeline state machine, mandatory locked decisions section, validated patterns section, when-to-stop section, reference materials section.

## MET-13 — `source-media-review.md`

**Summary.** Inspect user-supplied media before planning.

**Description.** Skill that walks the agent through ffprobe + transcript sampling + content-summary writing before the proposal stage can run when user-supplied media exists.

**Acceptance criteria.**
- [ ] Each input file gets a `reviewed: true` flag + non-empty probe data + content_summary.

---

# Epic COR — Bundled Core Skills

Cross-cutting craft skills consumed by multiple pipelines.

## COR-1 — `bundled/skills/core/ffmpeg.md`

**Summary.** Core ffmpeg patterns the agent uses for concat, trim, silence-detect, probe, etc.

**Description.** Operational craft guide — common filter graphs, audio extraction, normalization, subtitle burn-in.

**Acceptance criteria.**
- [ ] Includes 10+ practical recipes.

## COR-2 — `bundled/skills/core/remotion.md`

**Summary.** Remotion patterns specific to predit's composition stack.

**Description.** Scene type catalog, prop schemas, when to use spring vs interpolate, common pitfalls.

**Acceptance criteria.**
- [ ] References the Remotion scene library shipped by COM-4.

## COR-3 — `bundled/skills/core/hyperframes.md`

**Summary.** HyperFrames patterns including the Remotion-vs-HyperFrames decision matrix.

**Description.** Audio-reactive primitives, CSS variable bridge, registry blocks, when to use HF vs Remotion.

**Acceptance criteria.**
- [ ] Includes the decision matrix from MET-7.

## COR-4 — `bundled/skills/core/color-grading.md`

**Summary.** Color grading patterns for ffmpeg / Remotion.

**Description.** LUT application, contrast/saturation tuning, look references.

**Acceptance criteria.**
- [ ] Skill present and referenced from the cinematic asset-director.

## COR-5 — `bundled/skills/core/subtitle-sync.md`

**Summary.** Word-level and segment-level subtitle timing patterns.

**Description.** Using the cuesheet to drive caption highlight, snap-to-word vs snap-to-segment tradeoffs, multi-line wrapping rules.

**Acceptance criteria.**
- [ ] Skill present; referenced by music-video and explainer pipelines.

## COR-6 — `bundled/skills/core/whisperx.md`

**Summary.** Advanced transcription patterns (alignment, diarization).

**Description.** When base whisper isn't enough — long audio, multiple speakers, non-English vocals.

**Acceptance criteria.**
- [ ] Includes diarization patterns and model selection.

---

# Epic L2P — Bundled Pipelines and Director Skills

Each pipeline issue produces: `bundled/pipelines/<slug>.yaml` manifest + per-stage director skill(s) + an `executive-producer.md`.

## L2P-COMMON-1 — Shared shot-prompt builder

**Summary.** Helper used by every scene-director skill that builds image-gen prompts from shot language + playbook style anchors.

**Description.** `bundled/skills/_shared/shot-prompt-builder.md` plus a TS helper at `src/prompts/shot-prompt-builder.ts`.

**Acceptance criteria.**
- [ ] Helper composes (subject, subject motion, scene, spatial framing, camera) into a coherent prompt with playbook style suffix.

## L2P-COMMON-2 — Shared research_brief schema

**Summary.** Zod + JSON schema for the optional research_brief artifact.

**Description.** Used by pipelines with a research stage (animated-explainer, animation, character-animation, cinematic, daily-news).

**Acceptance criteria.**
- [ ] Schema present.

## L2P-COMMON-3 — Shared script schema

**Summary.** Zod + JSON schema for the script artifact.

**Description.** Sections, timing, narration text, character dialogue (when applicable), enhancement cues.

**Acceptance criteria.**
- [ ] Schema present.

## L2P-1 — Animated-explainer pipeline + director skills

**Summary.** Pipeline manifest + research / proposal / script / scene_plan / asset / edit / compose / publish director skills + executive-producer skill.

**Description.** Topic-to-fully-generated-explainer workflow. Default playbook: clean-professional or flat-motion-graphics. Locked decisions vary by brief.

**Acceptance criteria.**
- [ ] All 8 director skills + executive-producer present and validated.
- [ ] Smoke run produces an end-to-end render against a fixture topic.

## L2P-2 — Animation pipeline + director skills

**Summary.** Motion-graphics-first videos (logo intros, kinetic typography, animated explainers).

**Description.** Includes specific guidance on Remotion vs HyperFrames choice, GSAP plugin usage.

**Acceptance criteria.**
- [ ] Asset-director references MET-7 (animation-runtime-selector).
- [ ] All director skills present.

## L2P-3 — Avatar-spokesperson pipeline + director skills

**Summary.** Presenter-led avatar or lip-sync videos.

**Description.** HeyGen-based talking head pipeline. Brand consistency, multi-scene with different backgrounds.

**Acceptance criteria.**
- [ ] Asset-director threads voice + avatar selection through the script stage.

## L2P-4 — Character-animation pipeline + director skills

**Summary.** Local rigged cartoon characters with reusable cast.

**Description.** Includes additional stages: `character_design` and `rig_plan` between script and scene_plan. Produces `character_design`, `rig_plan`, `action_timeline`, `pose_library`, `character_qa_report` artifacts (see CHR epic).

**Acceptance criteria.**
- [ ] Pipeline manifest declares the extra stages.
- [ ] Character-design director skill teaches the agent to consult `shows/<show>/characters/<slug>/` and respect existing character sheets.

## L2P-5 — Cinematic pipeline + director skills

**Summary.** Trailer, teaser, mood-led edits.

**Description.** Includes the slideshow-risk check at scene_plan, motion-required guardrail throughout, climax alignment via audio subsystem.

**Acceptance criteria.**
- [ ] Asset-director includes the camera-motion vocabulary.
- [ ] Compose-director enforces motion-led delivery promise.

## L2P-6 — Clip-factory pipeline + director skills

**Summary.** Many short clips from one long source.

**Description.** Source-led workflow: scene detect + segment ranking + auto-reframe to vertical/square aspect.

**Acceptance criteria.**
- [ ] Idea-director includes input-media analysis.
- [ ] Asset stage uses scene-detect output to select clip windows.

## L2P-7 — Daily-news pipeline + director skills

**Summary.** TTS newsreader / daily broadcast format.

**Description.** Includes `capture` stage for source screenshots via Playwright. Research + scripted narration. Sample-first cost guard.

**Acceptance criteria.**
- [ ] Capture-director skill includes Playwright recipes.
- [ ] Pipeline manifest declares the capture stage.

## L2P-8 — Documentary-montage pipeline + director skills

**Summary.** Retrieval-led documentary.

**Description.** Pulls stock from archive.org, NASA, NOAA, Library of Congress, Wikimedia, etc. CLIP-based retrieval. No formal proposal/script stages — driven by topic + retrieval.

**Acceptance criteria.**
- [ ] Asset-director includes clip-search workflows.
- [ ] Includes the "tone poem" approach guidance.

## L2P-9 — Framework-smoke pipeline

**Summary.** Minimal 2-stage pipeline used for end-to-end testing.

**Description.** No real generation — fixtures throughout. Used by CI smoke tests.

**Acceptance criteria.**
- [ ] Pipeline runs in <30s on CI.
- [ ] Produces an asset_manifest + render_report against fixtures.

## L2P-10 — Hybrid pipeline + director skills

**Summary.** Source footage + generated support visuals.

**Description.** Common for tutorials and product walkthroughs that need cutaways.

**Acceptance criteria.**
- [ ] Scene-director includes source-vs-generated decisioning.

## L2P-11 — Localization-dub pipeline + director skills

**Summary.** Subtitle, dub, translated variants.

**Description.** Uses heygen video-translate, target language voice casting, locale-aware subtitle rendering.

**Acceptance criteria.**
- [ ] Script-director includes translation workflow.

## L2P-12 — Music-video pipeline + director skills

**Summary.** Vertical music videos for AI-generated music tracks.

**Description.** Audio-led pipeline with cuesheet stage. Lifts the validated patterns: per-section accent colors, beat-drop tags, white-flash transitions, long-hold splits, masking strategies, HyperFrames intro vs Higgsfield image-to-video.

**Acceptance criteria.**
- [ ] Executive-producer encodes the locked decisions (9:16 canvas, HyperFrames runtime, whisper-first, sample-first).
- [ ] Scene-director uses cuesheet for anchoring.
- [ ] Compose-director enforces sample sub-checkpoint.

## L2P-13 — News-song pipeline + director skills

**Summary.** Music-led news with PS2-era visuals + real source screenshots.

**Description.** Audio-led + capture stage for evidence. Source flyout HUDs. No-caption default.

**Acceptance criteria.**
- [ ] Capture-director includes source screenshot workflow.
- [ ] Compose-director includes the PS2 source-flyout overlay pattern.

## L2P-14 — Podcast-repurpose pipeline + director skills

**Summary.** Highlights and derivatives from podcast audio.

**Description.** Source-led with chapter detection, quote extraction, social-clip generation.

**Acceptance criteria.**
- [ ] Scene-director includes chapter-based segmentation.

## L2P-15 — Screen-demo pipeline + director skills

**Summary.** Screen recordings and walkthroughs.

**Description.** Two modes: `real_capture` (cap_recorder / screen_recorder / playwright) and `synthetic_terminal` (Remotion TerminalScene). Idea-director picks the mode.

**Acceptance criteria.**
- [ ] Idea-director includes the mode-selection decision.
- [ ] Asset stage routes to the chosen capture path.

## L2P-16 — Talking-head pipeline + director skills

**Summary.** Footage-led speaker videos with polish.

**Description.** Source video → transcript → cleanup → captions → final.

**Acceptance criteria.**
- [ ] Asset-director includes silence-cutter usage.

## L2P-17 — The ChaosFM pipeline + director skills

**Summary.** News-song subclass for The ChaosFM brand.

**Description.** Inherits from news-song with brand-specific defaults (playbook, character cast).

**Acceptance criteria.**
- [ ] Manifest is minimal — inherits most fields from news-song.

---

# Epic L3V — Bundled Vendor Skills (Layer 3)

Layer 3 vendor knowledge. Each issue ports one vendor skill. The list grows over time — `L3V-0` is the catch-all instruction to port new skills as they appear.

## L3V-0 — Layer 3 skill discovery and porting protocol

**Summary.** Document how to add new Layer 3 skills.

**Description.** A `bundled/skills/agents/README.md` explaining the format, frontmatter, and contract (read before calling the corresponding tool).

**Acceptance criteria.**
- [ ] README present; skill template referenced.

## L3V-1..L3V-75 — Port individual vendor skills

**Summary.** One issue per vendor skill family.

**Description.** Each issue ports one skill (or a tightly-related family — e.g. `gsap-*` is one issue). The skill teaches provider-specific prompt structure, parameter tuning, quality keywords. See `.migration/coverage-audit.md` for the mapping table.

**Acceptance criteria per issue.**
- [ ] Skill present at `bundled/skills/agents/<name>.md`.
- [ ] Tool definitions that use this skill reference it via `agent_skills: [...]`.
- [ ] Frontmatter validated.

---

# Epic PBK — Bundled Playbooks

## PBK-1 — Playbook Zod + JSON schema

**Summary.** Validate playbooks.

**Description.** Fields: palette, typography, motion rules (allowed transitions, pacing min/max), audio mood, asset preferences, quality_rules.

**Acceptance criteria.**
- [ ] Schema present at `bundled/schemas/styles/playbook.schema.json`.

## PBK-2 — Playbook generator

**Summary.** Helper that builds a new playbook from a brief or reference.

**Description.** Given a brief or a VideoAnalysisBrief, generate a playbook stub with palette + typography + motion rules inferred. Used by the capability-extension protocol when none of the bundled playbooks fit.

**Acceptance criteria.**
- [ ] Generates a valid playbook from a fixture brief.

## PBK-3..PBK-12 — Bundled playbook ports

**Summary.** Port each starter playbook.

**Description.** One issue per playbook: anime-ghibli, clean-professional, flat-motion-graphics, minimalist-diagram, news-broadcast, news-song-protest, news-song, playful-hip-hop-explainer, ps2-dystopian-news-rap, thechaosfm-gta-political.

**Acceptance criteria per issue.**
- [ ] Playbook at `bundled/playbooks/<name>.yaml` validates against PBK-1 schema.
- [ ] Includes palette, typography, motion rules, audio mood.

## PBK-13 — Callout template

**Summary.** Reusable callout/lower-third template for 16:9.

**Description.** Port `callouts_16x9.template.yaml`.

**Acceptance criteria.**
- [ ] Template present and consumed by compose-director skills that surface callouts.

---

# Epic IMG — Image generation tools

## IMG-1 — image_gen capability documentation (no selector tool)

**Summary.** Document the capability and confirm `registry.select('image_generation', ...)` works.

**Description.** Smoke test that the selector picks an available image-gen tool.

**Acceptance criteria.**
- [ ] Test fixture with two registered image-gen tools confirms selection by preference.

## IMG-2 — Generic image_gen wrapper

**Summary.** A thin selector-router for image gen that adapts schemas between providers.

**Description.** Optional convenience — most callers use `registry.select('image_generation')` directly; this issue is for a unified `imageGen.generate({...})` ergonomic helper.

**Acceptance criteria.**
- [ ] Helper available; provider-specific param adapters tested.

## IMG-3 — FLUX image tool (BFL API)

**Summary.** Integrate BFL FLUX as an `api` integration.

**Description.** Layer 3 skill: `flux-best-practices`. Cost per image.

**Acceptance criteria.**
- [ ] Tool produces an image against a fixture prompt (manual; not in CI).
- [ ] Cost tracked.
- [ ] `agent_skills: ['flux-best-practices', 'bfl-api']`.

## IMG-4 — Google Imagen tool

**Summary.** Integrate Google Imagen.

**Description.** API integration; env var for service account.

**Acceptance criteria.**
- [ ] Tool produces an image (manual).

## IMG-5 — OpenAI image tool

**Summary.** OpenAI gpt-image-1.

**Description.** Useful when legible text is required.

**Acceptance criteria.**
- [ ] Tool produces an image (manual).
- [ ] Documented for "reserved for cases requiring legible text" per user-policy notes.

## IMG-6 — Grok image tool

**Summary.** Grok image generation.

**Acceptance criteria.**
- [ ] Tool produces an image (manual).

## IMG-7 — Recraft image tool

**Summary.** Recraft v3.

**Acceptance criteria.**
- [ ] Tool produces an image (manual).

## IMG-8 — Local diffusion tool

**Summary.** Local SD / SDXL via diffusers.

**Description.** Runtime `binary` (subprocess) or `library` (via a Python helper) — pick at impl time.

**Acceptance criteria.**
- [ ] Tool available when local model present; reports unavailable otherwise.

## IMG-9 — Code snippet image tool

**Summary.** Render code snippets as styled images.

**Description.** Used by explainer / talking-head pipelines for terminal/code overlays.

**Acceptance criteria.**
- [ ] Renders a snippet to a transparent PNG.

## IMG-10 — Diagram generation tool

**Summary.** Render Mermaid / D2 / Graphviz diagrams.

**Description.** Wraps Mermaid CLI for the common case.

**Acceptance criteria.**
- [ ] Renders a Mermaid source to PNG/SVG.

## IMG-11 — Manim math animation tool

**Summary.** Wrap Manim for math/science animations.

**Description.** `binary` integration shelling to `manim` CLI.

**Acceptance criteria.**
- [ ] Renders a fixture scene.

---

# Epic VID — Video generation tools

## VID-1 — video_gen capability documentation

**Summary.** Confirm `registry.select('video_generation', ...)` routing.

**Acceptance criteria.**
- [ ] Selection by preference verified.

## VID-2 — Higgsfield video tool (CLI integration)

**Summary.** Integrate Higgsfield via its CLI.

**Description.** First-class `cli` integration with `cli-login` auth. Wraps Kling v2.1 Pro image-to-video by default.

**Acceptance criteria.**
- [ ] Tool detects `higgsfield` binary on PATH.
- [ ] `predit setup higgsfield` runs `higgsfield login`.
- [ ] Tool produces a 5-sec clip from a reference image and prompt (manual).
- [ ] Cost tracked at $0.30/clip default.

## VID-3 — Kling video tool (direct API)

**Summary.** Direct Kling API integration.

**Acceptance criteria.**
- [ ] Tool produces a clip (manual).

## VID-4 — Seedance Replicate tool

**Acceptance criteria.**
- [ ] Tool produces a clip (manual).

## VID-5 — Seedance direct tool

**Acceptance criteria.**
- [ ] Tool produces a clip (manual).

## VID-6 — Runway video tool

**Acceptance criteria.**
- [ ] Tool produces a clip (manual).

## VID-7 — VEO video tool

**Acceptance criteria.**
- [ ] Tool produces a clip (manual).

## VID-8 — MiniMax video tool

**Acceptance criteria.**
- [ ] Tool produces a clip (manual).

## VID-9 — Hunyuan video tool

**Acceptance criteria.**
- [ ] Tool produces a clip (manual).

## VID-10 — Wan video tool

**Acceptance criteria.**
- [ ] Tool produces a clip (manual).

## VID-11 — CogVideo tool

**Acceptance criteria.**
- [ ] Tool produces a clip (manual).

## VID-12 — LTX Video local tool

**Summary.** LOCAL_GPU integration.

**Acceptance criteria.**
- [ ] Tool detects local GPU; runs against a fixture (when GPU available).

## VID-13 — LTX Video modal tool

**Summary.** Modal-hosted LTX.

**Acceptance criteria.**
- [ ] Tool produces a clip (manual).

## VID-14 — Grok video tool

**Acceptance criteria.**
- [ ] Tool produces a clip (manual).

## VID-15 — Clip cache

**Summary.** Cache generated clips by prompt + provider + model to avoid recomputation.

**Acceptance criteria.**
- [ ] Repeated calls with identical params return cached path.

## VID-16 — Clip search (CLIP-based)

**Summary.** Search a corpus of generated clips by semantic similarity to a prompt.

**Acceptance criteria.**
- [ ] Returns ranked matches from a fixture corpus.

## VID-17 — Auto-reframe

**Summary.** Convert 16:9 → 9:16 (or other aspects) with subject tracking.

**Description.** Combines face/object detection with smart crop.

**Acceptance criteria.**
- [ ] A fixture 16:9 clip is reframed to 9:16 with subject centered.

---

# Epic STK — Stock media tools

## STK-1..STK-18 — Stock source integrations

**Summary.** One issue per stock source: pexels_image, pixabay_image, pexels_video, pixabay_video, archive_org, coverr, dareful, esa, jaxa, loc, mixkit, nara, nasa, noaa, pond5_pd, unsplash, videvo, wikimedia.

**Description.** Each source has its own API quirks. Per issue: implement the tool, declare integration kind (api / binary / library), document install_instructions, register Layer 3 skill if useful.

**Acceptance criteria per issue.**
- [ ] Tool returns ≥3 matches for a fixture query (manual).
- [ ] Returned assets include attribution metadata.

## STK-19 — Direct cross-source clip search

**Summary.** Single query that fans out to all configured stock sources.

**Description.** Used by documentary-montage and explainer asset stages.

**Acceptance criteria.**
- [ ] Returns aggregated, ranked results from all available sources.

---

# Epic TTS — TTS tools

## TTS-1 — TTS capability via `registry.select('tts', ...)`

**Acceptance criteria.**
- [ ] Selection works with preference list.

## TTS-2 — ElevenLabs TTS tool

**Description.** Voice cloning, premium voices. Layer 3 skill `elevenlabs`.

**Acceptance criteria.**
- [ ] Tool produces narration audio (manual).
- [ ] Voice IDs are pulled from `characters/<name>/voice_id.txt` when episode cast is set.

## TTS-3 — OpenAI TTS tool

**Acceptance criteria.**
- [ ] Tool produces narration (manual).

## TTS-4 — Google TTS tool

**Description.** Chirp3-HD recommended default for cost-sensitive runs.

**Acceptance criteria.**
- [ ] Tool produces narration (manual).

## TTS-5 — Piper TTS tool (local)

**Description.** Free offline TTS. `binary` integration.

**Acceptance criteria.**
- [ ] Tool produces narration locally.

## TTS-6 — Doubao TTS tool

**Acceptance criteria.**
- [ ] Tool produces narration (manual).

---

# Epic MUS — Music generation tools

## MUS-1 — music_gen wrapper

**Summary.** Selector for music generation.

**Acceptance criteria.**
- [ ] Selection works.

## MUS-2 — Suno music tool

**Description.** API integration if available; otherwise documented as user-supplied via `music_library/`.

**Acceptance criteria.**
- [ ] If API key configured, produces a track; otherwise reports `unavailable`.

## MUS-3 — Freesound tool

**Acceptance criteria.**
- [ ] Returns matches for a query (manual).

## MUS-4 — Pixabay music tool

**Acceptance criteria.**
- [ ] Returns matches for a query (manual).

## MUS-5 — Music plan stage prompt

**Summary.** A surfaced sub-protocol the agent uses at proposal time to decide music source.

**Description.** Per AGENT_GUIDE music-plan-mandatory rule: check `music_library/` first; check generation APIs second; offer royalty-free sources; present choices to user.

**Acceptance criteria.**
- [ ] Skill at `bundled/skills/meta/music-plan.md` references the checking order and explicit choices.

---

# Epic AUX — Audio processing tools

## AUX-1 — Audio enhance tool

**Description.** Noise reduction, normalization, EQ.

**Acceptance criteria.**
- [ ] Improves a noisy fixture.

## AUX-2 — Audio mixer tool

**Description.** Combine narration + music + SFX with ducking.

**Acceptance criteria.**
- [ ] Produces a balanced mix.

## AUX-3 — Subtitle generator tool

**Description.** SRT/VTT generation from word timestamps.

**Acceptance criteria.**
- [ ] Generates valid SRT from a cuesheet.

## AUX-4 — Silence cutter

**Description.** Trim silences in talking-head footage with configurable thresholds.

**Acceptance criteria.**
- [ ] Reduces fixture duration by ≥20% on a silence-heavy clip.

---

# Epic ANL — Analysis tools

## ANL-1 — Audio energy probe

**Description.** RMS energy windowing for AUD-3 (sections).

**Acceptance criteria.**
- [ ] Returns RMS values at configurable window size.

## ANL-2 — Face tracker

**Description.** Used by auto-reframe.

**Acceptance criteria.**
- [ ] Returns face bboxes per frame.

## ANL-3 — Frame sampler

**Description.** Uniform or scene-aware frame sampling for FNL-2.

**Acceptance criteria.**
- [ ] Samples N frames evenly from a fixture clip.

## ANL-4 — Scene detector

**Description.** PySceneDetect equivalent.

**Acceptance criteria.**
- [ ] Detects scene boundaries within 200 ms of obvious cuts.

## ANL-5 — Transcriber tool (registry entry)

**Description.** Re-export AUD-2 / AUD-10 as a registered tool for `analysis` capability.

**Acceptance criteria.**
- [ ] Tool available when whisper.cpp present.

## ANL-6 — Transcript fetcher

**Description.** Pull captions from YouTube/Vimeo/etc. (uses video-download).

**Acceptance criteria.**
- [ ] Returns parsed captions from a fixture URL.

## ANL-7 — CLIP embedder

**Description.** Embed images/clips for similarity search (used by clip-search).

**Acceptance criteria.**
- [ ] Embedding present + reproducible.

## ANL-8 — Corpus builder

**Description.** Index a directory of clips/images for search.

**Acceptance criteria.**
- [ ] Indexes a fixture directory.

## ANL-9 — Source media review tool + artifact

**Summary.** Generate `source_media_review.json` from a directory of user-supplied media.

**Description.** Probe each file (ffprobe + content summary). Schema at `bundled/schemas/artifacts/source_media_review.schema.json`.

**Acceptance criteria.**
- [ ] Produces a validated artifact for a fixture directory.

## ANL-10 — Video downloader (yt-dlp)

**Description.** `binary` integration wrapping yt-dlp.

**Acceptance criteria.**
- [ ] Downloads a fixture YouTube URL.

## ANL-11 — Video understand

**Description.** Combined frame sampling + audio transcription for "understand what's in this video" use case.

**Acceptance criteria.**
- [ ] Produces a content summary for a fixture clip.

---

# Epic COM — Composition (FFmpeg / Remotion / HyperFrames)

## COM-1 — FFmpeg tool (general purpose)

**Summary.** Register ffmpeg as a `binary` tool for concat / trim / probe / silence-detect.

**Acceptance criteria.**
- [ ] Tool available when ffmpeg on PATH.
- [ ] Trim/concat smoke tests pass.

## COM-2 — FFprobe utility

**Summary.** Thin wrapper used by AUD-1, ANL-3, FNL-2.

**Acceptance criteria.**
- [ ] Returns parsed JSON for a fixture clip.

## COM-3 — `video_compose` runtime router

**Summary.** Single entry point that dispatches to FFmpeg / Remotion / HyperFrames based on `render_runtime`.

**Description.** Reads `edit_decisions.render_runtime`, routes accordingly. Surfaces a structured blocker if the locked runtime is unavailable (no silent swap).

**Acceptance criteria.**
- [ ] Routing tested for each of the three runtimes.
- [ ] Unavailable runtime triggers ACT-3 escalation.

## COM-4 — Remotion scene library

**Summary.** Port the scene library: text_card, stat_card, callout, comparison, hero_title, terminal_scene, anime_scene, bar_chart, line_chart, pie_chart, kpi_grid, progress_bar. Plus overlay types: section_title, stat_reveal, hero_title, provider_chip.

**Description.** Lives in `src/remotion/` and is consumed by Remotion render runs. Scene type list in `bundled/skills/core/remotion.md`.

**Acceptance criteria.**
- [ ] Every scene type renders against a fixture prop.
- [ ] Snapshot tests verify visual output.

## COM-5 — Remotion caption burn

**Summary.** Word-level caption rendering inside Remotion.

**Description.** Consumes cuesheet word timestamps + playbook caption style.

**Acceptance criteria.**
- [ ] Captions render in sync with audio (±50 ms vs cuesheet).

## COM-6 — HyperFrames compose adapter

**Summary.** Render via HyperFrames CLI from edit_decisions.

**Description.** Shell out to `npx hyperframes` with the appropriate composition spec. Surface HyperFrames doctor warnings to the user.

**Acceptance criteria.**
- [ ] A fixture composition renders end-to-end.

## COM-7 — Playbook → HyperFrames CSS variable bridge

**Summary.** Translate a playbook's palette/typography/motion into CSS variables HyperFrames consumes.

**Description.** Ensures the same playbook drives consistent look across Remotion and HyperFrames runs.

**Acceptance criteria.**
- [ ] CSS variables produced match the playbook fields.

## COM-8 — Green-screen composite

**Summary.** Replace green-screen backgrounds with generated or stock backdrops.

**Acceptance criteria.**
- [ ] Composites a fixture green-screen clip onto a backdrop.

## COM-9 — Green-screen processor

**Summary.** Chroma-key extraction quality controls.

**Acceptance criteria.**
- [ ] Produces clean alpha mattes on fixture clips.

## COM-10 — Showcase card

**Summary.** Programmatic card composition (logo + headline + product shot).

**Acceptance criteria.**
- [ ] Renders a card from a fixture spec.

## COM-11 — Video stitcher

**Summary.** Concat with crossfade options.

**Acceptance criteria.**
- [ ] Stitches N clips with the requested transitions.

## COM-12 — Video trimmer

**Summary.** Precise trim utility.

**Acceptance criteria.**
- [ ] Trims to within 1 frame of requested duration.

---

# Epic AVT — Avatar / lip sync

## AVT-1 — Lip sync tool

**Description.** Wraps an avatar lip-sync provider.

**Acceptance criteria.**
- [ ] Produces lip-synced video from audio + still or video (manual).

## AVT-2 — Talking head renderer

**Description.** Generates talking-head visuals from script + voice + avatar selection.

**Acceptance criteria.**
- [ ] Produces a clip (manual).

## AVT-3 — HeyGen video tool

**Description.** Full HeyGen integration.

**Acceptance criteria.**
- [ ] Avatar video, create-video, and video-translate workflows tested (manual).

---

# Epic ENH — Enhancement

## ENH-1..ENH-6 — Background remove, color grade, eye enhance, face enhance, face restore, upscale

**Summary.** One tool per enhancement.

**Acceptance criteria per issue.**
- [ ] Improves a fixture per the tool's purpose.

---

# Epic CHR — Character animation

## CHR-1 — Character animation tool

**Description.** Local rigged character renderer.

**Acceptance criteria.**
- [ ] Renders a fixture character animation.

## CHR-2 — Action timeline artifact schema

**Summary.** Sequence of poses + transitions per character.

**Acceptance criteria.**
- [ ] Schema present.

## CHR-3 — Character design artifact schema

**Summary.** Visual design specification.

**Acceptance criteria.**
- [ ] Schema present.

## CHR-4 — Character QA report schema

**Summary.** QA findings on character renders (consistency, anatomy).

**Acceptance criteria.**
- [ ] Schema present; CHR-1 tool emits findings against it.

## CHR-5 — Pose library schema

**Summary.** Reusable pose definitions.

**Acceptance criteria.**
- [ ] Schema present.

## CHR-6 — Rig plan schema

**Summary.** Rig specification for SVG character animation.

**Acceptance criteria.**
- [ ] Schema present.

---

# Epic CAP — Capture

## CAP-1 — cap_recorder tool

**Description.** macOS screen recorder via system CLI.

**Acceptance criteria.**
- [ ] Records a fixture window.

## CAP-2 — Screen capture selector

**Summary.** Pick the best available screen recorder (cap_recorder / screen_recorder / playwright).

**Acceptance criteria.**
- [ ] Selection works across platforms.

## CAP-3 — Generic screen recorder

**Description.** Cross-platform screen capture wrapper.

**Acceptance criteria.**
- [ ] Records on macOS and Linux.

## CAP-4 — Playwright recording tool

**Summary.** Browser flow recording via Playwright.

**Acceptance criteria.**
- [ ] Records a fixture page flow.

---

# Epic EXP — NLE Export

## EXP-1 — Export base infrastructure

**Summary.** `predit export` reads edit_decisions + cuesheet + asset_manifest + render_report.

**Acceptance criteria.**
- [ ] Resolves all four artifacts from `projects/<show>/<episode>/`.
- [ ] Aborts with a useful error when an artifact is missing.

## EXP-2 — Asset linkage modes

**Summary.** `copy | symlink | reference` per `specs/09-export.md`.

**Acceptance criteria.**
- [ ] All three modes produce a working export package.

## EXP-3 — Premiere XML exporter (FCP7 XML)

**Acceptance criteria.**
- [ ] Output imports cleanly into Premiere with cuts and audio intact (manual).

## EXP-4 — CapCut draft exporter

**Acceptance criteria.**
- [ ] Output imports into CapCut (mobile or desktop) with cuts, captions, and assets (manual).

## EXP-5 — DaVinci XML exporter

**Acceptance criteria.**
- [ ] Output imports cleanly into Resolve (manual).

## EXP-6 — EDL exporter (CMX 3600)

**Acceptance criteria.**
- [ ] Output is a valid CMX 3600 EDL.

## EXP-7 — Publish log artifact schema

**Summary.** Records what was exported, when, where.

**Acceptance criteria.**
- [ ] Schema present.

---

# Epic UPL — User project lifecycle

## UPL-1 — `predit init`

**Summary.** Scaffold a new user project per `specs/10-installation-and-user-projects.md`.

**Description.** Create CLAUDE.md, AGENTS.md, .gitignore, .predit/ cache, empty shows/, projects/, music_library/. Optionally `--git` to run `git init`. Optionally `--starter <name>` to scaffold a starter show.

**Acceptance criteria.**
- [ ] Running in an empty directory produces the documented file tree.
- [ ] Running in a directory that already has predit content errors with a clear message.

## UPL-2 — User-project AGENTS.md template

**Summary.** Ship the user-project AGENTS.md.

**Description.** Already authored at `bundled/templates/user-project/AGENTS.md`. Issue: confirm template is included in the published npm package.

**Acceptance criteria.**
- [ ] Template ships in the npm package's `files`.
- [ ] `predit init` copies it correctly.

## UPL-3 — `.predit/` cache materialization

**Summary.** On `predit init`, copy bundled content into `.predit/`.

**Description.** Copy `bundled/pipelines/`, `bundled/playbooks/`, `bundled/skills/`, `bundled/schemas/`, `bundled/starters/` from the installed package into `.predit/`. Write `.predit/version.json` with the harness version.

**Acceptance criteria.**
- [ ] All bundled content mirrored.
- [ ] `version.json` matches installed package version.

## UPL-4 — `predit update`

**Summary.** Refresh `.predit/` from the currently installed harness.

**Description.** Re-copy bundled content; update `version.json`. Detect version mismatch on every command and warn.

**Acceptance criteria.**
- [ ] Stale `.predit/` after a harness upgrade is refreshed by `predit update`.
- [ ] Version mismatch produces a warning on every other command.

## UPL-5 — `predit watch`

**Summary.** Background watcher on music_library/ (and configurable paths) that suggests imports.

**Description.** Read each show's `ingest.watch[]` config. Watch the declared paths. On match, print a suggested `predit import` command.

**Acceptance criteria.**
- [ ] Dropping a folder under `music_library/` triggers a suggestion within 2s.

## UPL-6 — `predit import`

**Summary.** Scaffold an episode from a dropped folder.

**Description.** Use the show's ingest config to detect pipeline + slug + inputs. Create the episode.yaml. Refuse to overwrite.

**Acceptance criteria.**
- [ ] Imports a fixture folder into a new episode.

## UPL-7 — Project-root detection in every command

**Summary.** Every command (except `init`) requires a project root.

**Description.** Use FND-6 helpers; produce a useful error pointing to `predit init` when no project root is found.

**Acceptance criteria.**
- [ ] Running `predit build` outside a project errors with a useful message.

---

# Epic STR — Starter shows

## STR-1..STR-7 — Bundled starter shows

**Summary.** One issue per starter: music-video, news-song, ww2-diary, product-demo, ai-workflow-demo, cinematic-trailer, documentary.

**Description.** Each starter at `bundled/starters/<name>/` includes:
- `show.yaml` (with sensible defaults)
- `brand/` stub (logo placeholder, palette, typography)
- `characters/_template/` (character.yaml + README)
- `episode.template.yaml`
- `README.md` explaining the starter

**Acceptance criteria per issue.**
- [ ] Starter present; cloning it via `predit new show <slug> --from <starter>` produces a working show.
- [ ] Documented in `predit ls starters` output.

---

# Epic CST — Cost tracking and budgets

## CST-1 — Cost tracker module

**Summary.** In-memory + persisted cost accounting.

**Description.** Every tool call with non-zero cost records: tool, provider, model, units, usd. Persist to `projects/<show>/<episode>/cost_log.json`.

**Acceptance criteria.**
- [ ] Tool calls update the log.
- [ ] Log persists across runs (resume picks up prior cost).

## CST-2 — Budget enforcement

**Summary.** `--budget <usd>` halts when exceeded.

**Description.** Before any paid tool call, the harness checks remaining budget. Refuses if exceeded.

**Acceptance criteria.**
- [ ] A run with `--budget 0.10` halts at the first paid call.

## CST-3 — Cost log schema

**Acceptance criteria.**
- [ ] Schema present.

## CST-4 — Stage-level cost estimate aggregation

**Summary.** Sum `estimated_cost` across pipeline stages to show projected total at proposal time.

**Description.** Both sample and full totals displayed.

**Acceptance criteria.**
- [ ] Proposal-time output shows projected total per stage and overall.

---

# Epic REF — Reference-driven workflow

## REF-1 — Video analysis brief schema

**Acceptance criteria.**
- [ ] Schema present per `bundled/schemas/artifacts/video_analysis_brief.schema.json`.
- [ ] Includes 5-aspect breakdown fields.

## REF-2 — Video analyzer tool

**Description.** Run scene detect + frame sample + transcribe + structural analysis; produce VideoAnalysisBrief.

**Acceptance criteria.**
- [ ] Analyzes a fixture YouTube URL and produces a valid brief.

## REF-3 — Reference-alignment review pass

**Summary.** Already partially covered by REV-5; this issue confirms the pass runs at every stage when a brief exists.

**Acceptance criteria.**
- [ ] Tests cover grounding, differentiation, promise preservation.

## REF-4 — Reference workflow integration

**Summary.** When user provides a URL on `predit build`, route to the video-reference-analyst skill before pipeline selection.

**Acceptance criteria.**
- [ ] URL detection routes correctly.
- [ ] Local file detection routes correctly.

---

# Epic CI — CI and quality

## CI-1 — GitHub Actions workflow

**Summary.** CI runs typecheck + test + smoke pipeline on push.

**Acceptance criteria.**
- [ ] Workflow file at `.github/workflows/ci.yml`.
- [ ] Workflow passes on main.

## CI-2 — Linting

**Summary.** ESLint + Prettier configured.

**Acceptance criteria.**
- [ ] `pnpm lint` runs.
- [ ] Pre-commit hook (optional husky integration) blocks unformatted commits.

## CI-3 — Smoke pipeline E2E

**Summary.** Run the framework-smoke pipeline end-to-end in CI against fixtures.

**Acceptance criteria.**
- [ ] CI produces a render_report against fixtures.

## CI-4 — Schema validation in CI

**Summary.** Every JSON schema and Zod schema is round-tripped against fixtures.

**Acceptance criteria.**
- [ ] CI fails when a schema changes without updating fixtures.

---

# Epic DOC — Documentation

## DOC-1 — Public README polish

**Summary.** Replace placeholder README with a quickstart + feature list.

**Acceptance criteria.**
- [ ] README includes install, init, first-build walkthrough.

## DOC-2 — Quickstart guide

**Summary.** Long-form quickstart at `docs/quickstart.md`.

**Description.** Walks a new user from `pnpm add -g predit` to their first rendered music-video sample.

**Acceptance criteria.**
- [ ] Document present; reproducible end-to-end on a fresh machine with at least one image and one TTS provider configured.

## DOC-3 — Shows roadmap template

**Summary.** A template at `bundled/templates/user-project/docs/ROADMAP.md` users can adopt.

**Description.** Encodes the three-layer mental model + show-type-per-row planning convention.

**Acceptance criteria.**
- [ ] Template present.

## DOC-4 — Provider catalog doc

**Summary.** `docs/providers.md` generated from the registry.

**Description.** A `predit ls tools --format=markdown > docs/providers.md` reference, regenerated via npm script.

**Acceptance criteria.**
- [ ] Generation script in package.json scripts.
- [ ] Output is current at release time.

## DOC-5 — Contributing guide

**Summary.** `CONTRIBUTING.md` for the harness repo.

**Description.** How to author a new pipeline, a new tool, a new skill. References AGENTS.md (harness contributor contract).

**Acceptance criteria.**
- [ ] Doc present; example "add a new tool" walkthrough.

## DOC-6 — Example user project repo

**Summary.** A separate public example repo demonstrating the user-project model in practice.

**Description.** Out of scope for this monorepo, but tracked as a follow-up issue for v0.2 to publish a working `predit-example` repo.

**Acceptance criteria.**
- [ ] Follow-up issue filed; not blocking v0.1.0.

---

# Out of scope for v0.1.0 (future epics)

These appear in the coverage audit but are deferred:

- Publishing automation (YouTube, social schedule)
- Cloud-distributed render farm
- Web UI for project management
- Plugin system for community-contributed pipelines
- LSP integration for editing `show.yaml` / `episode.yaml` with auto-complete

---

# Glossary

| Term | Definition |
|---|---|
| Harness | The `predit` CLI + bundled content |
| User project | The user-owned folder where `predit init` was run |
| Show | A recurring series (e.g. "music-videos"), authored as `shows/<slug>/show.yaml` |
| Episode | A single rendered output, authored as `shows/<show>/episodes/<slug>.yaml` |
| Pipeline | The workflow (stages + tools + approval gates) |
| Playbook | The look (palette, typography, motion, audio mood) |
| Director skill | Markdown skill teaching the agent how to execute a pipeline stage |
| Meta skill | Cross-cutting agent protocol (reviewer, checkpoint, etc.) |
| Layer 3 skill | Vendor-specific prompt engineering / parameter knowledge |
| Master clock | Whether audio or voiceover drives scene timing |
| Cuesheet | Canonical audio-subsystem artifact (segments, sections, beats, climax, anchors) |
| Bundled | Content shipped with the harness, mirrored into the user project's `.predit/` cache |
