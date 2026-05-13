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

**Documented simplification vs sibling.** Predit deliberately simplifies provider ranking to preference + availability + discovery order. The sibling system used a 7-dimension weighted formula (task_fit 0.30, output_quality 0.20, control 0.15, reliability 0.15, cost_efficiency 0.10, latency 0.05, continuity 0.05) plus 11 synonym clusters, 9 feature weights, and 5 brief-aware adjustments. The predit choice is a v0.1.0 simplification with two known consequences:

1. Routes that the sibling chose may not match predit's routes. Example: explainer briefs with `requires_motion: false` might pick FLUX in predit where the sibling picked Imagen on cost-efficiency. The agent's prompts and the playbook's style anchors absorb most of this difference; the rest is acceptable v0.1.0 drift.
2. Reviewer at proposal stage should still see ≥ 2 `options_considered` for any `provider_selection` decision, so the simplification doesn't hide tradeoffs from the audit trail.

If real production drift surfaces (a pipeline consistently picks a worse provider than the sibling did), revisit in v0.2 with the full weighted formula — the seven dimensions and adjustment table are tracked at `bundled/notes/provider-scoring.md` for reference.

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

**Summary.** Detect environment problems that prevent tools from running. Warnings carry a severity so red-flag silent-failure conditions stand out.

**Description.** Each tool may declare a `warnings()` hook returning structured items `{ severity: 'info' | 'warn' | 'red_flag', message: string, fix?: string }`. Aggregate in `registry.warnings()` and surface them in `predit doctor` and at the top of any production command.

**Acceptance criteria.**
- [ ] `warnings()` returns the structured shape above (not bare strings).
- [ ] `predit doctor` renders `red_flag` items in red, verbatim, with the `fix` string when present.
- [ ] `--json` output includes a `warning` event per item with `severity` field stable.
- [ ] Pre-declared `red_flag` warnings include: `npm_package_not_resolvable` (e.g. `hyperframes` package not resolvable), `node_version_too_low` (Node < 22), `binary_missing` for tools whose `binary` is on PATH but a sibling dependency isn't.
- [ ] Warnings surface as a prefix block in `predit build` runs (and again as JSON events under `--json`).

## REG-8 — `predit doctor` command

**Summary.** The capability menu rendered to the terminal (human + JSON modes) with a stable NDJSON event schema.

**Description.** Wire `doctor` to `registry.refreshAvailability()` then `menuSummary()` + `setupOffers()` + `warnings()`. Human mode renders a colored summary grouped by capability with composition runtimes as a dedicated row; `--json` emits NDJSON events for each section.

**Acceptance criteria.**
- [ ] Running `predit doctor` against an empty environment shows zero-key tier.
- [ ] After setting an env var that unlocks a tool, re-running `predit doctor` reflects it.
- [ ] Composition runtimes (Remotion, HyperFrames, FFmpeg) render as a dedicated row per `specs/16-onboarding-and-discovery.md` Step 3 template.
- [ ] Setup offers are grouped by effort tier: `env_var`, `cli_login`, `install`, `complex`.
- [ ] Before menu rollup, `doctor` compares installed harness version to `.predit/version.json` and prints a warning if mismatch.
- [ ] **Stable NDJSON event schema** at `bundled/schemas/doctor/event.schema.json`:
  - `{ type: 'capability_summary', capability: string, configured: number, total: number, providers: { name, status, install_instructions }[] }`
  - `{ type: 'runtime_summary', runtime: 'remotion'|'hyperframes'|'ffmpeg', available: boolean }`
  - `{ type: 'setup_offer', tool: string, install: string, effort: 'env_var'|'cli_login'|'install'|'complex' }`
  - `{ type: 'warning', severity: 'info'|'warn'|'red_flag', tool: string|null, message: string, fix?: string }`
- [ ] `--json` output validates against `event.schema.json`. CI gates on this.

## REG-9 — `predit setup <tool>` command

**Summary.** Shell out to the tool's native install/login command and re-probe.

**Description.** Read the tool's `integration.install` string and run it in the user's terminal (passing through stdio). For `cli-login` tools, also run the `auth.check` command afterward to confirm success. After success, refresh availability and display the updated capability menu for the tool's capability family. Never collect credentials.

**Acceptance criteria.**
- [ ] `predit setup higgsfield` (with a fixture tool) runs the declared install command.
- [ ] After install/login, predit runs `registry.refreshAvailability()` and prints the updated menu rollup for the tool's capability family.
- [ ] When the install command supports `--dry-run`, predit runs that first to verify the install path resolves (no 404 on the package name).
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

**Description.** Express the show schema in Zod with the multi-pipeline shape: `slug`, `display_name`, `description`, `created`, `brand`, `characters`, `skills`, `pipelines` (non-empty map of `{ <name>: PipelineConfig }`), `defaults` (with required `pipeline` referencing a `pipelines` key), `ingest`, `export`. Each `PipelineConfig` carries optional `playbook`, `runtime`, `aspect`, `budget_usd`, `playbook_overrides` (path).

**Acceptance criteria.**
- [ ] Zod schema present in `src/shows/show-schema.ts`; inferred type exported as `Show`.
- [ ] `pipelines` is `z.record(z.string(), PipelineConfigSchema).refine(m => Object.keys(m).length >= 1)` — empty map rejected with a clear error.
- [ ] `defaults.pipeline` is `z.string()` and validated cross-field against `pipelines` keys; mismatch rejected with `"defaults.pipeline '<name>' is not a key in pipelines"`.
- [ ] Each `pipelines[<name>]` has optional `playbook`, `runtime` (enum `ffmpeg | remotion | hyperframes`), `aspect`, `budget_usd`, `playbook_overrides`.
- [ ] `ingest.watch[].pipeline` (when present) is validated against `pipelines` keys at load time; mismatch rejected.
- [ ] Valid examples parse: single-pipeline show, multi-pipeline show (TheChaosFM news-song + music-video), Last Rev (screen-demo + talking-head).
- [ ] Invalid examples fail with helpful errors: missing required fields, wrong types, `defaults.pipeline` not in map, empty `pipelines`, `ingest.watch[].pipeline` not in map.

## SHW-2 — `episode.yaml` Zod schema

**Summary.** Validate the episode manifest, including cross-field validation against the parent show's declared pipelines.

**Description.** Express the episode schema: `slug`, `title`, `created`, `pipeline` (optional; resolves to `show.defaults.pipeline` when omitted), `playbook`, `runtime`, `aspect`, `budget_usd`, `inputs`, `cast`, `tags`. All fields except `slug` and `inputs` are optional. Cross-field validation: `pipeline` (when present) must be a key in the parent show's `pipelines` map.

**Acceptance criteria.**
- [ ] Schema honors the "anything omitted falls back to show defaults" rule via optionals.
- [ ] Inferred type exported as `Episode`.
- [ ] `validateEpisodeAgainstShow(episode, show)` helper returns structured errors when `episode.pipeline` is set but not in `show.pipelines`.
- [ ] Test fixture: episode pointing at an undeclared pipeline yields `"episode.pipeline 'music-video' is not declared in show.pipelines. Available: ['news-song']"`.
- [ ] Test fixture: episode with `pipeline` omitted + show with `defaults.pipeline = news-song` resolves to `news-song`.

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

**Summary.** Compose pipeline + playbook + per-pipeline overrides + episode into a single `ResolvedContext`.

**Description.** Implement `resolveContext({ show, episode })` per the 9-step order in `specs/04-shows-and-episodes.md` → "Resolution order". Pipeline name resolves from `episode.pipeline ?? show.defaults.pipeline`, validates against `show.pipelines`, then loads the pipeline manifest. Playbook resolves from `episode.playbook ?? show.pipelines[<pipeline>].playbook`. Per-pipeline `playbook_overrides` deep-merge on top of the playbook; per-pipeline defaults (runtime, aspect, budget) deep-merge on top of pipeline defaults; episode overrides win last.

**Acceptance criteria.**
- [ ] Resolved context contains the effective values from every layer in the documented order.
- [ ] Test: single-pipeline show resolves identically to the multi-pipeline form with one entry.
- [ ] Test: TheChaosFM multi-pipeline fixture — episode picks `news-song` vs `music-video` and gets different playbooks/runtimes correctly.
- [ ] Test: episode omits `pipeline` → uses `show.defaults.pipeline`.
- [ ] Test: episode names a pipeline not in `show.pipelines` → fails before pipeline manifest is loaded.
- [ ] Test: per-pipeline `playbook_overrides` only apply to that pipeline's resolved context (no cross-contamination).
- [ ] Test: deep-merge semantics covered (arrays replace; `null` removes; nested objects merge).

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

## SHW-10 — `predit new show <slug>` (with optional `--from <starter>`, `--pipelines <list>`)

**Summary.** Scaffold a new show directory.

**Description.** Create `shows/<slug>/show.yaml` from a default template, optionally cloning a starter from `.predit/starters/<starter>/`. Accepts `--pipelines <name>[,<name>...]` to seed the `pipelines:` map with declared workflows; defaults to one pipeline that prompts the user. Refuse to overwrite an existing show.

**Acceptance criteria.**
- [ ] New `shows/<slug>/show.yaml` is created with a valid `pipelines:` map (at least one entry).
- [ ] `--from <starter>` copies brand/, characters/, pipelines/ override directory, episode.template.yaml, README.md from the starter and seeds the `pipelines:` map matching the starter.
- [ ] `--pipelines news-song,music-video` scaffolds a multi-pipeline show with sensible per-pipeline defaults pulled from each bundled pipeline manifest.
- [ ] Without `--pipelines`, the command prompts interactively for at least one pipeline (or accepts piped input in non-interactive mode).
- [ ] Existing directory triggers an error (no clobbering).
- [ ] Scaffolded `show.yaml` validates against SHW-1 schema on a round-trip parse.

## SHW-11 — `predit new episode <show> [<slug>] [--pipeline <name>]`

**Summary.** Scaffold a new episode under a show with explicit pipeline selection.

**Description.** Create `shows/<show>/episodes/<slug>.yaml`. If `<slug>` is omitted, prompt or auto-generate from a timestamp. Pull from `shows/<show>/episode.template.yaml` if present. The episode's `pipeline:` field is set explicitly: from `--pipeline <name>` if provided, else from `show.defaults.pipeline`. The chosen pipeline MUST be a key in `show.pipelines`.

**Acceptance criteria.**
- [ ] New episode file is created with `slug`, `title`, `created`, `pipeline` filled in.
- [ ] `--pipeline <name>` validates against `show.pipelines` and errors clearly when unknown (lists available pipelines).
- [ ] Without `--pipeline`, the scaffolded `pipeline:` matches `show.defaults.pipeline`; in interactive mode the command lists the show's pipelines and lets the user pick.
- [ ] Template (if present) is copied and pre-filled.
- [ ] Scaffolded `episode.yaml` validates against SHW-2 schema on a round-trip parse.

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

**Description.** Encode top-level fields (`slug`, `display_name`, `description`, `status`, `master_clock`, `defaults`, `stages`, `export`, `metadata`, `orchestration`, `sample`) and the per-stage fields (`slug`, `description`, `skill`, `produces`, `tools_available`, `review_focus`, `success_criteria`, `human_approval`, `audio_sync`, `sample_mode_supported`, `estimated_cost`, `requires_runtime`).

**Acceptance criteria.**
- [ ] All fields documented in the spec are typed.
- [ ] `human_approval` is the 3-level enum (`required | optional | never`).
- [ ] `audio_sync` enum is `build | required | none`.
- [ ] `master_clock` enum is `audio | voiceover | action_timeline | none`.
- [ ] Per-stage `description` is an optional documentation string.
- [ ] `metadata` is `z.record(z.string(), z.unknown())` with passthrough semantics — extra keys do not trip strict-mode rejection. Documented as the home for brand identity, content-mode enums, and pipeline-specific configuration.
- [ ] Manifest validates with a **minimal** shape: `slug` + `stages` only. `orchestration`, `defaults`, `metadata`, `export`, `sample` are all optional. (Framework-smoke is a 26-line manifest with two stages and must load.)
- [ ] **At most one stage may declare `audio_sync: build`** — multi-build manifests are rejected with a clear error.
- [ ] **`audio_sync: required` may not precede any `audio_sync: build` stage** in declared order.
- [ ] **Stage slugs are unique** within a manifest.
- [ ] **Canonical stages declared by the manifest follow the canonical relative order** (`research → idea → proposal → script → capture → cuesheet → character_design → rig_plan → scene_plan → assets → edit → compose → publish`). Non-canonical stages may sit between any two canonical stages.
- [ ] `requires_runtime` is valid only on the `compose` stage.
- [ ] `orchestration` block (optional) carries `budget_default_usd`, `max_revisions_per_stage`, `max_send_backs`, `max_wall_time_minutes`. Defaults: `3.00 / 2 / 3 / 30` when omitted.
- [ ] `sample` block (optional) carries `duration_s_min`, `duration_s_max`, `hint`. Used by `--sample` mode to scope sample duration per pipeline.
- [ ] Test fixtures cover: framework-smoke minimal, music-video full, documentary-montage (no script/cuesheet), daily-news (+capture), character-animation (+character_design +rig_plan), thechaosfm (with `metadata.brand` block).

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

**Description.** Cuts (start_s, end_s, asset_id, transition_in, transition_out, provider), overlays, subtitle config, music config, locked `render_runtime`, locked `renderer_family`, brand metadata.

**Acceptance criteria.**
- [ ] Schema enforces no overlapping cuts.
- [ ] `render_runtime` is `z.enum(['ffmpeg', 'remotion', 'hyperframes'])`; validated against the registry's available runtimes when validated in-context.
- [ ] `renderer_family` is `z.enum(['explainer-data', 'explainer-teacher', 'cinematic-trailer', 'documentary-montage', 'product-reveal', 'screen-demo', 'presenter', 'animation-first'])` (8 values). Required.
- [ ] `audio.music.ducking` accepts `z.union([z.boolean(), z.object({enabled, threshold_db, reduction_db, attack_ms, release_ms})])`. Tests cover both forms.
- [ ] Legacy field support: top-level `music` (legacy) and `audio.music` (preferred) both accepted; when both present, `audio.music` wins. Global `transitions[]` (legacy) and per-cut `transition_in/transition_out` (preferred) both accepted; when both present, per-cut wins.
- [ ] Helper `migrateEditDecisions(legacy) → modern` normalizes to modern form.
- [ ] Per-cut `provider` field records the asset's generation provider (e.g. `playwright_recording`, `flux`, `kling`) for the type-separation rule (no fake-news screenshots in news-song; see L2P-13).
- [ ] `brand: { slug, name }` recorded when the run is brand-scoped (e.g. from a show with `metadata.brand`).
- [ ] Test fixtures: legacy edit_decisions migrates correctly; modern form round-trips.

## PIP-7 — Proposal packet artifact schema

**Summary.** Schema for `proposal_packet` produced by the proposal stage.

**Description.** Concept variants (`concept_options[]`), recommended tool path, alternatives, cost estimate, music plan, delivery_promise, production_plan (renderer_family + render_runtime + audio_architecture), reference_alignment (when reference-driven).

**Acceptance criteria.**
- [ ] Schema present at `src/artifacts/proposal_packet.ts` + `bundled/schemas/artifacts/proposal_packet.schema.json`.
- [ ] `concept_options` is `z.array().min(3)` — proposals with fewer than 3 distinct concepts fail validation (and reviewer flags as critical).
- [ ] `production_plan.render_runtime` is `z.enum(['ffmpeg', 'remotion', 'hyperframes'])`.
- [ ] `production_plan.renderer_family` is the 8-value enum from PIP-6.
- [ ] `production_plan.audio_architecture` is `z.enum(['single_narrator', 'character_dialogue', 'narrator_plus_characters', 'no_narration'])`. Required for cinematic, animation, character-animation, news-song; optional elsewhere.
- [ ] `delivery_promise` carries `requires_motion`, `requires_narration`, `requires_music`, `motion_required` (hard rule trigger), `min_motion_ratio` (per PROMISE_RULES table, e.g. motion_led=0.7).
- [ ] `decision_log_ref` field references the cumulative decision log (`projects/<show>/<episode>/decisions.json`).
- [ ] Test fixtures: cinematic proposal with `audio_architecture`, documentary-montage proposal with `requires_narration: false`, reference-driven proposal with `reference_alignment` populated.

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

**Description.** Ordered scenes with rich shot_language, narrative_role, asset requirements, hero/character flags. The enum surface is large and load-bearing — downstream tooling (shot-prompt builder, slideshow_risk, variation_checker) reads these names verbatim.

**Acceptance criteria.**
- [ ] Schema present at `src/artifacts/scene_plan.ts` + `bundled/schemas/artifacts/scene_plan.schema.json`.
- [ ] `scenes[]` ordered list; each scene has `id`, `start_s`, `end_s`, `description`, `hero_moment: boolean`, `scene_anchor` (from cuesheet), `shot_language`, `narrative_role`, `information_role` (optional), `shot_intent` (optional), `required_assets[]`, `texture_keywords[]` (optional), `character_actions[]` (optional).
- [ ] `shot_language.shot_size` enum (10 values): `ECU, CU, MCU, MS, MLS, LS, WS, EWS, OTS, POV`.
- [ ] `shot_language.camera_movement` enum (18 values): `static, pan_left, pan_right, tilt_up, tilt_down, dolly_in, dolly_out, truck_left, truck_right, crane_up, crane_down, orbit_cw, orbit_ccw, push_in, pull_out, handheld, gimbal_walk, whip_pan`.
- [ ] `shot_language.lighting_key` enum (11 values): `high_key, low_key, natural, golden_hour, blue_hour, neon, practical, motivated, soft, hard, rim`.
- [ ] `shot_language.lens_mm` constrained to integers: `[14, 24, 35, 50, 85, 135, 200]`.
- [ ] `shot_language.depth_of_field` enum (3 values): `shallow, deep, rack_focus`.
- [ ] `shot_language.color_temperature` enum (4 values): `tungsten, daylight, mixed, monochrome`.
- [ ] `narrative_role` enum (10 values): `hook, setup, inciting_incident, rising_action, beat_drop, climax, falling_action, resolution, tag, transition`.
- [ ] `required_assets[].source` enum (4 values): `generated, stock, captured, supplied`.
- [ ] `scene_anchor` is the typed `SceneAnchor` from `specs/07-audio-subsystem.md`.
- [ ] `character_actions[]` shape: `{ character_id: string, action_sequence: string[] }`.
- [ ] Scene durations sum to within ±0.5s of episode duration; max scene duration ≤ pipeline's `defaults.max_scene_duration_s`.
- [ ] Test fixtures cover: music-video scene plan (8 scenes, all anchored), cinematic scene plan (hero_moment with full shot_language), character-animation scene plan (character_actions populated).

## PIP-11 — Runner state machine

**Summary.** The harness loop that runs stages in order, with preflight refresh at start.

**Description.** Implement `Runner.run({show, episode, ...})` per `specs/05-pipelines.md`. Refreshes registry availability at the start of every run so stale tool status doesn't surprise the agent mid-run.

**Acceptance criteria.**
- [ ] `Runner.run()` calls `registry.refreshAvailability()` at start; warnings (per REG-7) surface as a prefix block before any stage executes.
- [ ] A pipeline with all stages set to `human_approval: never` runs end-to-end without prompts.
- [ ] A stage with `human_approval: required` in interactive mode prompts; in `--non-interactive` mode exits with `awaiting_human`.
- [ ] `--from <stage>` skips earlier stages and loads their prior artifacts from checkpoints.
- [ ] `--only <stage>` runs only the named stage.
- [ ] Budget enforcement halts the run when cumulative cost exceeds `--budget`.
- [ ] Runner reads per-pipeline orchestration limits (`max_revisions_per_stage`, `max_send_backs`, `max_wall_time_minutes`) from PIP-2's `orchestration` block and enforces them.

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

**Description.** Encode `stage`, `status` enum, `timestamp`, `artifact`, `review_summary`, `cost_snapshot`, `tool_invocations`, optional `style_playbook` field for audit trail.

**Acceptance criteria.**
- [ ] Schema present in `src/checkpoints/schema.ts` and JSON schema at `bundled/schemas/checkpoints/checkpoint.schema.json`.
- [ ] `status` enum: `z.enum(['in_progress', 'completed', 'awaiting_human', 'failed'])`.
- [ ] Optional `style_playbook: string` captures the resolved playbook slug at the time of checkpoint write (so retrospectively a checkpoint can be inspected for which playbook was in effect even if the playbook has since been edited).
- [ ] Optional `skills_read: string[]` tracks which Layer 3 vendor skills the agent declared having read during the stage — populated for review (see REV-13).

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

**Summary.** Format the approval block per a fixed section order.

**Description.** Given a checkpoint, render the approval block. Section order is **fixed** so users and downstream parsers can rely on it.

**Acceptance criteria.**
- [ ] **Fixed section order**:
  1. Stage-complete header (`## Stage complete: <stage>`)
  2. Artifact summary (≤ 5 bullets)
  3. Review findings (counts + every critical finding shown in full)
  4. Cost so far (`stage cost / total / budget remaining` + projected next-stage cost)
  5. Action options (`approve | revise | abort`)
- [ ] Findings are not silently truncated; critical findings always show fully (description + proposed_fix).
- [ ] In `--json` mode, the same sections are emitted as distinct NDJSON events.

## CHK-6 — `predit approve / revise / status / resume` commands

**Summary.** The user-facing commands that drive checkpoints in `--non-interactive` mode.

**Description.** `approve` advances past `awaiting_human`. `revise "<note>"` re-runs the current stage with the note appended to context. `status` prints the current state. `resume` is `build` without `--from`.

**Acceptance criteria.**
- [ ] All four commands work end-to-end against a fixture run.
- [ ] `--json` emits structured events.

## CHK-7 — Sample sub-checkpoint (versioned)

**Summary.** A non-stage checkpoint produced after a sample render, with iteration support.

**Description.** Sample sub-checkpoints are versioned so iterative sample refinement is tractable. Write `projects/<show>/<episode>/checkpoints/sample_v{N}.json` with the rendered sample path, sample cost, projected full cost, status `awaiting_human`.

**Acceptance criteria.**
- [ ] Versioned naming: `checkpoints/sample_v1.json`, `sample_v2.json`, etc. Asset at `assets/sample/sample_v{N}.mp4`.
- [ ] `sample.latest_version: N` field tracks the latest version (so the runner doesn't need to ls the directory).
- [ ] Each version's checkpoint carries `cost_for_this_sample`, `cumulative_sample_cost`, `projected_full_cost`.
- [ ] Sample-mode runs end at the latest sample checkpoint awaiting human approval.
- [ ] Approval (`predit approve <show>/<episode>`) continues into the full run.
- [ ] `predit revise <show>/<episode> "<note>"` increments the sample version and re-runs the sample stages with the note appended to context.

---

# Epic REV — Reviewer Protocol

Depends on PIP, CHK.

## REV-1 — Review artifact schema

**Summary.** Zod + JSON schema for the per-stage review artifact.

**Description.** Encode `stage`, `round`, `decision`, `findings[]`, `summary` counts.

**Acceptance criteria.**
- [ ] Schema present at `src/artifacts/review.ts`.
- [ ] `decision` is `z.enum(['pass', 'revise', 'pass_with_warnings'])`.
- [ ] `findings[].severity` is `z.enum(['critical', 'suggestion', 'nitpick', 'investigation'])`.
- [ ] `findings[].status` is `z.enum(['pending', 'fixed', 'accepted', 'deferred'])`.
- [ ] `findings[].location` is a freeform string (artifact path, line number, frame timestamp).
- [ ] `findings[].proposed_fix` is optional but, when present on a `critical` finding, MUST satisfy the specificity heuristic (see REV-3).
- [ ] `findings[].patch` (optional) is `{ artifact_path: string, new_value: unknown }` — structured replacement that REV-2's revision round can apply automatically.
- [ ] `summary` includes counts by severity plus `success_criteria_met / success_criteria_total`.

## REV-2 — Reviewer runner

**Summary.** Run the reviewer pass against a stage's artifact before checkpointing.

**Description.** Implement `runReview(stage, artifact, ctx) → Review`. Loads `review_focus` and `success_criteria` from the manifest, validates the artifact against its schema, evaluates focus items, applies CHAI rules, returns the Review.

**Acceptance criteria.**
- [ ] A passing artifact returns `decision: 'pass'` with no critical findings.
- [ ] A schema-invalid artifact returns critical.
- [ ] Max 2 rounds is enforced; the third call returns `pass_with_warnings`.

## REV-3 — CHAI enforcement

**Summary.** Enforce Accurate / Complete / Constructive rules on findings, including the `proposed_fix` specificity heuristic.

**Description.** When a reviewer produces a `critical` finding without a `proposed_fix`, or with a `proposed_fix` that fails the specificity heuristic, auto-downgrade to `investigation` and emit a structured warning. Pattern-match for "scan the rest of the same class" before returning.

**Acceptance criteria.**
- [ ] Critical finding without `proposed_fix` is auto-downgraded to `investigation` — test covered.
- [ ] Critical finding with `proposed_fix` shorter than 40 characters AND no `patch` → auto-downgraded — test covered.
- [ ] Critical finding with `proposed_fix` containing no specific token (no number, no ALLCAPS identifier, no quoted string, no file path) AND no `patch` → auto-downgraded — test covered.
- [ ] Critical finding with a `patch` object always passes the specificity gate, regardless of `proposed_fix` text.
- [ ] Auto-downgrade preserves the original critical wording in `description` and emits a `proposed_fix_below_specificity_bar` structured warning event.
- [ ] Findings always include the `location` field (artifact path or frame timestamp).
- [ ] Same-class pattern-match: when a `critical` finding is recorded, a follow-up scan in the same review round looks for additional instances of the same defect class (e.g. all scenes with `shot_intent` missing, not just the first one).

## REV-4 — Playbook quality-rules cross-check

**Summary.** When a playbook is active, verify the artifact against its `quality_rules`.

**Description.** Load the resolved playbook and run its quality rules (palette adherence, transition allowlist, pacing min/max). Each violation becomes a `suggestion`.

**Acceptance criteria.**
- [ ] Tests cover palette mismatch, transition outside allowlist, pacing violation.

## REV-5 — Reference alignment review pass

**Summary.** When a reference video brief exists, check grounding, differentiation, promise preservation, and cost alignment.

**Description.** Compare the proposal/script/scene_plan against the reference VideoAnalysisBrief. Plus cost-drift detection across every stage.

**Acceptance criteria.**
- [ ] Grounding: hallucinated reference claims → critical. Test fixture: proposal mentions "fast pacing" when VideoAnalysisBrief shows `pacing_style: "slow_contemplative"`.
- [ ] Differentiation: carbon-copy proposals (same topic + structure + treatment as reference) → critical. Weak differentiation (only surface-level changes) → suggestion.
- [ ] Promise preservation: user-loved elements missing → suggestion (per-element).
- [ ] **Cost-alignment check**: when cumulative actual cost exceeds approved budget by **>30%** without an intervening approval decision → critical. Test fixture: `approved_budget = $4.00`, `cumulative_cost = $5.30` (>30% over) without a fresh approval → critical.
- [ ] **New assets beyond approved proposal** → suggestion. Test fixture: scene_plan adds scenes not in proposal → suggestion.
- [ ] Pass path covered: a faithful proposal with cost within 30% of estimate → no findings.

## REV-6 — Delivery promise validator

**Summary.** Validate the produced edit_decisions / render against the proposal's delivery promise, using the PROMISE_RULES table.

**Description.** Implement `validateCuts(promise, cuts) → ValidationResult` per the full PROMISE_RULES table. Used by REV at edit stage and by FNL at compose.

**Acceptance criteria.**
- [ ] PROMISE_RULES table (8 rows) implemented verbatim:

  | Promise | min_motion_ratio | still_fallback_allowed | requires_video_generation |
  |---|---|---|---|
  | `motion_led` | 0.70 | false | true |
  | `cinematic_hybrid` | 0.50 | false | true |
  | `avatar_presenter` | 0.30 | true | false |
  | `hybrid` | 0.20 | true | false |
  | `narration_over_graphics` | 0.10 | true | false |
  | `still_led` | 0.00 | true | false |
  | `source_led` | 0.00 | true | false |
  | `screen_demo` | 0.00 | true | false |

- [ ] `_SLIDE_GRAMMAR_TYPES` frozenset (10 cut types): `text_card, stat_card, callout, comparison, hero_title, ken_burns, slide_in, slide_out, fade_in, fade_out`.
- [ ] `_REAL_MOTION_TYPES` frozenset (3 types): `video_clip, animation, motion_graphic`.
- [ ] Video file extension list for motion classification: `("mp4","mov","webm","avi","mkv")`.
- [ ] Motion-led violation rule: `still_fallback_allowed: false AND (slide_cuts + still_cuts) > total * 0.5 AND approved_fallback != "still_led"` → critical.
- [ ] `classifyFromBrief(brief) → DeliveryPromise` maps pipeline + brief signals to a promise: cinematic → motion_led; explainer with narration → narration_over_graphics; talking-head → avatar_presenter; etc. (10-row mapping from sibling-of-record's classification.)
- [ ] Override rules: `motion_required = false` downgrades motion_led to hybrid; `has_footage = true` upgrades non-source to source_led.
- [ ] Dropped narration on a narration-required promise triggers critical.

## REV-7 — Slideshow risk scoring

**Summary.** Heuristic that scores how slideshow-y a scene plan or edit is, with per-dimension thresholds.

**Description.** Compute a 0-5 score across the six dimensions below; emit a verdict plus per-dimension findings.

**Acceptance criteria.**
- [ ] Function signature: `scoreSlideshowRisk(scenes, edit?, rendererFamily) → { score: number, verdict: 'strong' | 'acceptable' | 'revise' | 'fail', dimensions: { [name]: { score: number, reason: string | null } } }`.
- [ ] **Six dimensions** (verbatim names): `repetition`, `decorative_visuals`, `weak_motion`, `weak_shot_intent`, `typography_overreliance`, `unsupported_cinematic_claims`.
- [ ] **Verdict thresholds**: average ≥ 4.0 → `fail`; ≥ 3.0 → `revise`; ≥ 2.0 → `acceptable`; else `strong`. Empty scenes list special-cases to `5.0 / fail`.
- [ ] **Per-dimension flag threshold**: any dimension score ≥ 3.0 produces a finding with the dimension-specific reason string.
- [ ] **Cinematic-only branch**: `unsupported_cinematic_claims` returns `0.0` (and reason: `"Not applicable for non-cinematic renderer_family"`) when `rendererFamily` does not contain `'cinematic'`.
- [ ] **Edit-stage regression rule**: when called at edit with prior scene_plan score, a higher score at edit than scene_plan flags `edit_regression` as a separate critical finding.
- [ ] **Scoring formulas** (verbatim):
  - `repetition`: `type_ratio > 0.7 → +2.0`; `unique_desc_ratio < 0.6 → +1.5`; `size_ratio > 0.6 → +1.5`.
  - `typography_overreliance`: tiered — text/stat-card ratio `> 0.6 → 4.0`, `> 0.4 → 2.5`, `> 0.2 → 1.0`.
- [ ] **Per-dimension reason strings** (verbatim):
  - `repetition`: `"X scenes use the same layout/shot size — vary the visual grammar"`
  - `decorative_visuals`: `"X scenes have no stated purpose (no information_role or shot_intent)"`
  - `weak_motion`: `"Camera movement exists but lacks narrative justification"`
  - `weak_shot_intent`: `"X scenes are missing shot_intent — why does this frame exist?"`
  - `typography_overreliance`: `"X% of scenes are text/stat cards — video feels like animated slides"`
  - `unsupported_cinematic_claims`: `"Claiming cinematic but missing hero moments / lighting / movement"`
- [ ] At scene_plan stage, `fail` verdict triggers critical; `revise` triggers suggestion.
- [ ] Tests cover: pass path (verdict strong, no findings); each dimension's threshold; the empty-scenes special case; the cinematic-only branch (non-cinematic renderer skips the cinematic-claims dimension); edit-stage regression flag.

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

**Summary.** Catch "every scene looks the same" failures using an 8-check rubric.

**Description.** Score scene variety across 8 named checks. Each check has specific gates (most require `len(scenes) >= 4` before activating).

**Acceptance criteria.**
- [ ] Function: `checkSceneVariation(scenes) → { score: number, verdict: 'poor' | 'fair' | 'good' | 'excellent', violations: Violation[] }`.
- [ ] **Eight checks** (verbatim names):
  1. `shot_size_variety` — distribution across ECU/CU/MS/WS/EWS should span ≥ 3 buckets.
  2. `consecutive_same_size_shots` — ≥ 3 consecutive scenes with same `shot_size` is a violation.
  3. `static_shot_overuse` — `> 0.5` of scenes with `camera_movement: static` is a violation.
  4. `lighting_variety` — ≥ 2 distinct `lighting_key` values across the plan.
  5. `hero_moment_distinctness` — hero scene's shot_size differs from both immediate neighbors.
  6. `description_specificity` — flag scenes whose `description` contains any of the **21 `GENERIC_PHRASES`**: `"beautiful", "stunning", "amazing", "epic", "cinematic shot", "wide shot", "close up", "the scene", "the moment", "a person", "someone", "people", "a place", "a view", "showing", "depicting", "featuring", "highlighting", "visualizing", "demonstrating", "illustrating"`.
  7. `texture_keywords_presence` — at least 1 scene has non-empty `texture_keywords[]`.
  8. `shot_intent_completeness` — every scene has a non-empty `shot_intent`.
- [ ] Most checks gate on `len(scenes) >= 4`; lighter rubric for shorter plans.
- [ ] Scoring formula: `score = min(5.0, len(violations) * 0.6)`.
- [ ] Verdict thresholds: `score < 2` → `poor` (critical); `< 3` → `fair` (suggestion); `< 4` → `good`; else `excellent`.
- [ ] Worked example in description (verbatim): `"Instead of 'a beautiful cityscape', try 'rain-slicked Tokyo intersection at night, neon reflections on wet asphalt'"`.
- [ ] Tests: synthetic identical scenes → `poor`. All distinct + specific descriptions → `excellent`. Pass-path coverage required.

## REV-11 — Scene pacing verifier

**Summary.** Verify scene durations match the pipeline's pacing rules.

**Description.** Check max scene duration, min scene duration, distribution. For music-led pipelines, also verify scenes don't bleed across section boundaries unintentionally.

**Acceptance criteria.**
- [ ] Tests cover a scene exceeding `max_scene_duration_s` (critical) and a scene split across a section boundary (suggestion).

## REV-12 — Creative differentiation review pass

**Summary.** The 6-check creative differentiation pass, distinct from variation (REV-10).

**Description.** Runs at `scene_plan` and `edit` stages. Per `specs/13-reviewer-protocol.md` → "Creative differentiation". Variation (REV-10) is one of the six inputs; the other five are independent.

**Acceptance criteria.**
- [ ] **Six checks** implemented:
  1. **Variation score** (from REV-10) — score ≤ 2 critical; ≤ 3 suggestion.
  2. **Playbook alignment** — does the active playbook fit this content? Cinematic trailer with `clean-professional` is a mismatch suggestion.
  3. **Shot language completeness** — every scene has `shot_size` and `shot_intent`; hero moments have all 6 fields populated.
  4. **`renderer_family` match at edit** — `edit_decisions.renderer_family` matches the proposal's choice. Unlogged change → critical.
  5. **`render_runtime` match at edit and compose** — `render_runtime` in edit_decisions and compose's `render_report` matches proposal's locked runtime. Unlogged change → critical.
  6. **Runtime-selection-presented-both-options at proposal** — `render_runtime_selection` decision lists both Remotion and HyperFrames when both are available (plus ffmpeg per DEC-4 when applicable). Single option considered when more were available → critical.
- [ ] Test fixtures cover each of the 6 checks independently in pass and fail forms.

## REV-13 — Layer 3 skill compliance pass

**Summary.** Verify the agent actually read the relevant Layer 3 vendor skills before calling each generation tool.

**Description.** For each generation tool invocation in `tool_invocations[]` (from checkpoint), check that the agent's `skills_read[]` (tracked at run time, persisted in checkpoint per CHK-1) includes every entry in the tool's `agent_skills` field.

**Acceptance criteria.**
- [ ] Reviewer iterates `tool_invocations[]` for the stage being reviewed.
- [ ] For each invocation, resolves the tool's `agent_skills` from the registry and verifies all are present in the run's `skills_read[]`.
- [ ] **Missing skills produce `suggestion` on first generation stage**, **`critical` by edit stage**.
- [ ] PIP-3 stage context exposes `markSkillRead(name: string)` that the agent calls to record reading. The runner persists the list in the checkpoint.
- [ ] Test fixtures: tool invoked with `agent_skills: ['flux-best-practices', 'bfl-api']`; checkpoint missing both → critical; checkpoint missing one → suggestion at asset stage, critical at edit stage; checkpoint has both → no finding.
- [ ] Aligns with the spec 11 phrase: "The difference between a generic prompt and a skill-informed prompt is the difference between 'usable' and 'cinematic.'"

---

# Epic DEC — Decision Log

Depends on PIP, CHK.

## DEC-1 — Decision log Zod + JSON schema

**Summary.** Per `specs/14-decision-log.md`.

**Description.** Entry shape: `id`, `stage`, `timestamp`, `category`, `options_considered[]`, `picked`, `reason`, `confidence`, `user_visible`, `supersedes`.

**Acceptance criteria.**
- [ ] Schema present at `src/artifacts/decision_log.ts` + `bundled/schemas/artifacts/decision_log.schema.json`.
- [ ] `category` is the full 15-value enum: `pipeline_selection, provider_selection, renderer_family_selection, render_runtime_selection, playbook_selection, playbook_override, music_source, motion_commitment, voice_selection, concept_selection, fallback_decision, downgrade_approval, budget_tradeoff, capability_extension, visual_accuracy_check`.
- [ ] `options_considered` is `z.array(OptionSchema).min(2)`. Single-option entries **fail Zod validation**. To represent "only one option was available," include the unavailable alternative with `rejected_because: "..."`.
- [ ] Each option: `{ label: string, rejected_because: string | null, notes?: string }`.
- [ ] `confidence` is `z.number().min(0).max(1)`.
- [ ] `supersedes` is `string | null` (id of a prior decision).
- [ ] `user_visible: boolean` documents whether this decision appears in the user-facing `predit status` / approval blocks.
- [ ] Test fixtures: valid 15-category entry; rejected single-option entry; renderer_family_selection with all 8 values considered; render_runtime_selection with all three runtimes considered (ffmpeg with rejected_because for motion-led brief).

## DEC-2 — Decisions read/write

**Summary.** Persist and load `projects/<show>/<episode>/decisions.json`.

**Description.** Append-only file. Each call to `recordDecision()` appends one entry. Supersede mechanic: prior entries are preserved; the new entry sets `supersedes`.

**Acceptance criteria.**
- [ ] Atomic append.
- [ ] Reads return decisions in insertion order.

## DEC-3 — Decision-log audit

**Summary.** A reviewer pass that checks log coverage against a per-stage required-entries table.

**Description.** Verify every required category for the current stage has an entry, options_considered has ≥ 2 items (guaranteed by DEC-1 schema), reasons aren't boilerplate, confidence values are realistic.

**Acceptance criteria.**
- [ ] Required-entries-by-stage table sourced from `bundled/decision-log/required-by-stage.yaml` (single source of truth read by both this reviewer pass and MET-5's `decision-log.md` skill):

  | Stage | Required categories |
  |---|---|
  | proposal | `render_runtime_selection`, `renderer_family_selection`, `playbook_selection`, `motion_commitment`, `concept_selection`, plus `music_source` for audio-led pipelines (`master_clock != none`) |
  | script | `voice_selection` (per character or single narrator) when pipeline produces narration |
  | assets | `provider_selection` per capability used; `model_selection` per provider when multiple models available |
  | edit | `render_runtime_selection` confirmed (or superseded); `fallback_decision` or `downgrade_approval` if edit deviates from scene_plan |
  | compose | `render_runtime_selection` (final, must match edit's); `fallback_decision`/`downgrade_approval` if compose substituted |

- [ ] Missing required category by edit stage → critical (was suggestion on first stage where missing).
- [ ] All-confidence-1.0 pattern → suggestion ("unrealistic confidence pattern — at least provider/runtime selection involves tradeoffs").
- [ ] Boilerplate-reason detector: flag reasons that are < 30 characters AND contain only common boilerplate tokens ("best option", "good choice", "default") with no specific justification.

## DEC-4 — Present-both-runtimes enforcement

**Summary.** The `render_runtime_selection` decision must list every runtime available on the machine plus any rejected-by-brief option.

**Description.** A critical reviewer finding when the `render_runtime_selection` decision has fewer options considered than the registry shows available (filtered for brief applicability).

**Acceptance criteria.**
- [ ] Test: Remotion + HyperFrames both available + single option → critical.
- [ ] Test: only one runtime available + that one listed + the other marked `rejected_because: "runtime not available on this machine"` → no finding.
- [ ] Test: brief has `delivery_promise.motion_required = false` AND ffmpeg available — `render_runtime_selection` lists ffmpeg too; missing ffmpeg → critical.
- [ ] Test: brief has `motion_required = true` — ffmpeg may be omitted OR included with `rejected_because: "still-image-only; brief requires motion-led delivery."` Both are acceptable; omission triggers no finding when `motion_required = true`.

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

**Summary.** Word-level transcription via whisper.cpp with content-type-aware model selection.

**Description.** Shell out to `whisper-cli` with `--output-json` flags that emit word-level timings. Default model: `medium.en` for English music vocals. Fall back to `medium` (no `.en`) for non-English with `--language`. Retry with `large-v3` when transcription quality is suspicious.

**Acceptance criteria.**
- [ ] Returns segments with word-level timestamps and confidence values.
- [ ] **Default model selection**: `medium.en` for English audio (typically music vocals); `medium` (no .en suffix) for non-English audio with `--language` flag passed through.
- [ ] **Retry rule**: retry transcription with `large-v3` when the initial result shows `> 20%` of tokens are music symbols (`♪`) or garbled (low-confidence dense runs). Logged as a `provider_selection` decision.
- [ ] Average word confidence below 0.8 surfaces as a reviewer suggestion at script stage.
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

**Summary.** Identify peak / drop / arrival / release moments with a precise algorithm.

**Description.** Compute RMS energy across the track, weight by section length, find local maxima separated by ≥ 3 seconds, classify each by surrounding energy curve. Default to algorithm-detected; agent or user can mark `source: 'manual'`.

**Acceptance criteria.**
- [ ] **Algorithm rules**:
  - Local maxima must be separated by **≥ 3 seconds**.
  - Peak weight = `local_rms × section_length_factor` (longer sections weight peaks higher).
  - Classification (`peak | drop | arrival | release`) determined by the surrounding **4-second** energy curve shape:
    - `peak`: high RMS preceded and followed by a slope drop
    - `drop`: high RMS preceded by ramp-up, followed by sudden silence (chorus-into-breakdown pattern)
    - `arrival`: ramp-up from low energy reaching high in < 2s
    - `release`: ramp-down from high energy
- [ ] Fixture tests cover: clear chorus (one peak), double chorus (two peaks), false-peak instrumental break (filtered out by section-length weighting), no-peak ambient track (returns empty).
- [ ] Returns at least one `ClimaxPoint` for a fixture song with an obvious chorus.
- [ ] Agent or user can mark `source: 'manual'` to override algorithm — manual entries always survive `buildCuesheet` re-runs.

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

**Summary.** Zod + JSON schema for the compose-stage final review per `specs/17-self-review-of-output.md`.

**Description.** Encode status, checks (technical_probe, visual_spotcheck, audio_spotcheck, promise_preservation, subtitle_check, optional transcript_comparison), issues_found, recommended_action.

**Acceptance criteria.**
- [ ] Schema present at `src/artifacts/final_review.ts` + `bundled/schemas/artifacts/final_review.schema.json`.
- [ ] `status` enum: `z.enum(['pass', 'revise', 'fail'])`.
- [ ] `recommended_action` enum: `z.enum(['present_to_user', 're_render', 'revise_edit', 'revise_assets', 'block'])`.
- [ ] `promise_preservation.render_runtime_used` enum: `z.enum(['ffmpeg', 'remotion', 'hyperframes'])`.
- [ ] `promise_preservation.runtime_swap_check` is a human-readable status string.
- [ ] All threshold fields typed: `motion_ratio_actual: z.number().min(0).max(1)`; `caption_sync_accuracy: z.number().min(0).max(1)`; `subtitle_check.accuracy_within_150ms: z.number().min(0).max(1)`.
- [ ] Optional `transcript_comparison: { word_accuracy: number, missing_words_pct: number }`.
- [ ] Test fixtures: pass / revise / fail outcomes; silent_downgrade_detected: true; runtime_swap_detected: true.

## FNL-2 — Technical probe and visual spotcheck

**Summary.** Use ffprobe + frame sampling to verify the render. Minimum 4 frames sampled.

**Description.** Probe duration/resolution/codecs; sample at least 4 frames distributed at 10%, 35%, 65%, 90% + one extra inside any hero scene; pass to a visual-QA agent for plausibility.

**Acceptance criteria.**
- [ ] `visual_spotcheck.frames_sampled` is `z.number().int().min(4)` — fewer than 4 frames is a schema violation.
- [ ] Probe data validates against the proposal's duration ±0.5s and resolution exact match.
- [ ] Sampled frames are saved alongside the final_review artifact at `projects/<show>/<episode>/final_review/frames/` for human inspection.
- [ ] Hero scene frame sampled in addition to the four time-positioned frames.

## FNL-3 — Audio spotcheck

**Summary.** Verify audio presence + caption timing + optional script-vs-render transcript comparison.

**Description.** ffprobe audio stream presence + RMS sampling at narration windows + caption sync against word timestamps in cuesheet. When a script artifact exists, transcribe the rendered output and compare word-count to the script.

**Acceptance criteria.**
- [ ] Narration window energy > silence threshold.
- [ ] **Caption sync threshold**: `caption_sync_accuracy = (words_within_±150ms / total_words)`. `< 0.95` → suggestion. `< 0.80` → critical.
- [ ] **Subtitle check**: `subtitle_check.accuracy_within_150ms` reports the same accuracy ratio for any burned-in subtitle track.
- [ ] **Transcript comparison** (optional, only when script artifact exists): transcribe the rendered output, compute `word_accuracy = matched_words / script_words`. `< 0.80` → critical (audio cut off or VO failed to render).
- [ ] Pass path covered: a clean fixture render scores ≥ 0.95 on all three.

## FNL-4 — Promise preservation check

**Summary.** Verify the rendered output matches the proposal's delivery_promise across four failure modes.

**Description.** Cross-check render's motion ratio, runtime used, narration/music presence, reference-loved elements.

**Acceptance criteria.**
- [ ] **All four `silent_downgrade_detected` triggers** implemented:
  1. motion-led promise + actual motion ratio below the PROMISE_RULES floor (`< 0.70` for motion_led)
  2. runtime swap (`render_runtime` actually used ≠ edit_decisions.render_runtime OR ≠ proposal.production_plan.render_runtime) without a logged `render_runtime_selection` decision that supersedes the original
  3. dropped narration on a narration-required promise
  4. missing reference-loved elements (when `video_analysis_brief` exists; per-element list from REF-1)
- [ ] `silent_downgrade_detected: true` is critical regardless of other thresholds.
- [ ] `runtime_swap_detected: true` is critical when no superseding decision exists.
- [ ] `runtime_swap_check` is a human-readable status string (e.g. `"ok — proposal=hyperframes, edit=hyperframes, render=hyperframes"`, `"detected — proposal=hyperframes, render=remotion, NO superseding decision"`, `"skipped — runtime not in proposal_packet"`).
- [ ] `motion_ratio_actual` populated for every render (zero for still-led briefs).

## FNL-5 — Halt-on-fail gate (preserves rendered output)

**Summary.** A failing final_review halts the pipeline, but the rendered output is preserved for inspection.

**Description.** Compose stage cannot present output to the user without `final_review.status === 'pass'`. On `revise`, the harness offers an auto-rerender (cheap regeneratable issues like a missing subtitle track). On `fail`, the harness halts and surfaces issues. The rendered file is kept on disk so the user can inspect it before retrying.

**Acceptance criteria.**
- [ ] Test simulates a failing self-review and confirms the pipeline halts.
- [ ] On `fail`, the rendered output is preserved at `projects/<show>/<episode>/renders/final-failed.mp4` (not deleted, not overwritten on retry until user approves).
- [ ] The failure block in the user-facing output lists the issues_found summary and offers: retry (regenerate), revise (loop a stage with notes), `predit approve --force` (audited override, requires explicit flag).
- [ ] `predit approve --force` writes a `force_approval` decision with category `downgrade_approval` to the decision log.

---

# Epic MET — Bundled Meta Skills

Markdown skills shipped at `bundled/skills/meta/*.md`. These are the production agent's brain.

## MET-1 — `onboarding.md`

**Summary.** First-contact discovery and capability presentation; the full 6-step protocol.

**Description.** Encode `specs/16-onboarding-and-discovery.md` as an operational skill the agent reads on first interaction.

**Acceptance criteria.**
- [ ] Frontmatter: `name`, `applies_to: meta`, `triggers: [first-interaction, vague-request]`.
- [ ] **All six steps present, in order**:
  1. Preflight discovery (call `predit doctor --json`, classify output)
  2. Setup-tier classification (Zero-key / Starter / Standard / Full / Full+GPU)
  3. Greet and orient (capability summary in plain language, ≤ 12 lines)
  4. Composition runtime reporting (Remotion + HyperFrames + FFmpeg as separate rows)
  5. Three starter prompts targeting different pipelines (plus reference-based prompt for all tiers)
  6. Workflow summary (2-3 sentences) + common follow-up Q&A
- [ ] Vague-vs-specific classification rule included verbatim from `specs/16-onboarding-and-discovery.md` → "Classification rule" section.
- [ ] Anti-patterns section (no JSON dumping, no every-tool list, no architecture explanation, no apology for missing capabilities).

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

**Summary.** How to log decisions during a run, with explicit cross-references to the announce/escalate and reviewer-audit protocols.

**Description.** Per `specs/14-decision-log.md`. The agent reads this before any major decision.

**Acceptance criteria.**
- [ ] Includes the full 15-category enum (`pipeline_selection, provider_selection, renderer_family_selection, render_runtime_selection, playbook_selection, playbook_override, music_source, motion_commitment, voice_selection, concept_selection, fallback_decision, downgrade_approval, budget_tradeoff, capability_extension, visual_accuracy_check`).
- [ ] Includes the required-entries-by-stage table verbatim from `specs/14-decision-log.md` (proposal → render_runtime_selection + renderer_family_selection + playbook_selection + music_source; asset → provider_selection per capability; edit/compose → render_runtime confirmation).
- [ ] Includes the present-both-runtimes hard rule with the ffmpeg-as-third-option clause.
- [ ] **Cross-references**:
  - "What to log" — this skill.
  - "When and how to surface" — read `.predit/skills/meta/announce-and-escalate.md` (MET-6).
  - "How the audit pass checks coverage" — read `.predit/skills/meta/reviewer.md` (MET-4) → Decision Log Review.
- [ ] Both `decision-log.md` and the reviewer's audit derive from `bundled/decision-log/required-by-stage.yaml` (single source of truth).

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

**Summary.** The escape hatch when no existing tool covers a need, with all 6 hard conditions enumerated.

**Description.** Strict protocol allowing project-scoped scripts/tools/playbooks/skills under guardrails.

**Acceptance criteria.**
- [ ] Includes the gap-type table verbatim (4 rows): **one-off transform** / **recurring visual need** / **missing provider** / **missing knowledge**.
- [ ] Includes the **6 hard conditions** for ad-hoc scripts verbatim:
  1. No existing tool covers the need (verified against registry via preflight).
  2. The script is idempotent (safe to re-run).
  3. The script produces a file artifact in the project workspace.
  4. The script is logged in the decision log with `category: "capability_extension"`.
  5. The user is informed verbatim: "I wrote a custom script for X because no existing tool handles Y."
  6. The script does NOT call external APIs without user approval.
- [ ] **Project-scoped placement rules**: scripts at `projects/<show>/<episode>/scripts/`, custom playbooks at `playbooks/<custom-name>.yaml` (validated against PBK-1 schema), project-scoped skills at `shows/<show>/skills/`, project-scoped tools at `projects/<show>/<episode>/tools/<name>.ts` (must inherit Tool interface, must register before use, requires user approval before first paid API call).
- [ ] **"Must NOT modify existing tools — create wrappers"** rule stated verbatim.
- [ ] Decision-log entry format example (verbatim from spec 14): includes `category: "capability_extension"`, options_considered with the rejected closest-existing-tool, picked label, reason, `user_visible: true`, `confidence`.

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
- [ ] `content_summary` MUST cite ≥ 2 probe fields (per ANL-9). Reviewer parses the summary and flags as critical if no probe field is referenced.
- [ ] When probe.duration_seconds < 10 AND content_summary mentions 'interview' or 'dialogue', flag as `critical investigation` (likely filename-derived hallucination).

## MET-14 — `sample-first.md` protocol

**Summary.** Sample-first as an agent-decided protocol (not just a CLI flag), with per-pipeline trigger thresholds.

**Description.** OpenMontage's sample-first contract is that sample is *triggered* by cost+time thresholds (per pipeline) or by brief characteristics — the agent decides whether to require a sample, not the user. Predit's `--sample` CLI flag (CHK-7, PIP-13) is the override; the default is agent-driven.

**Acceptance criteria.**
- [ ] Skill present at `bundled/skills/meta/sample-first.md`.
- [ ] **Per-pipeline triggers** encoded verbatim:
  - **music-video**: estimated cost `> $0.50` OR estimated time `> 15 min`
  - **news-song**: estimated cost `> $1.00` OR estimated time `> 15 min`
  - **cinematic**: ALWAYS when reference-driven OR motion-required
  - **character-animation**: ALWAYS
  - **documentary-montage**: ALWAYS when 1+ hero scene present
  - **animated-explainer, animation, hybrid**: estimated cost `> $1.00` OR estimated time `> 20 min`
  - **avatar-spokesperson, talking-head**: estimated cost `> $0.50` (avatar generation is expensive per second)
- [ ] **Reviewer at proposal stage** flags any pipeline whose proposal-time estimates fire a trigger but which lacks a `sample_required: true` flag in `production_plan` as critical.
- [ ] Skill documents the override: if the user explicitly insists on skipping sample after being advised, the agent records a `downgrade_approval` decision and proceeds.
- [ ] Skill cross-references `.predit/skills/meta/announce-and-escalate.md` for the gentle-pushback phrasing.

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

## Content-fidelity testing infrastructure

A pipeline director skill that exists is not enough. The audit found that "presence-only" acceptance criteria fail to preserve named-production learnings, numeric constants, governance phrases, and prompt-engineering blocks that make the difference between "usable" and "cinematic" output. Every L2P issue therefore carries a **Content-fidelity acceptance** subsection beyond standard presence checks.

**Test mechanism.** Each L2P issue ships a string-match test suite at `bundled/skills/pipelines/<pipeline>/__fixtures__/required-strings.yaml`. The fixture lists:

- `required_sections[]` — verbatim section headers that must appear in the named skill file
- `required_phrases[]` — verbatim governance phrases or rules
- `required_numerics[]` — exact numeric constants with units (e.g. `"5.0 seconds"`, `"0.65 opacity"`, `"220px solid"`)
- `required_modules[]` — named blocks of prose (e.g. "5 PS2 prompt modules", "RAG Shelf Sprint validated patterns")

A vitest suite under `tests/content-fidelity/` reads each fixture file and greps the corresponding skill markdown for every required item. Missing items fail the suite. The fixtures are authored by the maintainer (Apache 2.0, ships with the harness).

**Diff report.** A separate CI script (CI-5, see below) walks the sibling-of-record and produces a diff report against the predit fixture content — surfaces removed numeric constants, removed governance phrases, removed validated-pattern blocks at port time. The report is reviewed manually before each minor release.

**Critical phrase examples** (these appear in multiple L2P issues; their loss in any single pipeline is a defect):

- `"silent runtime swap is a CRITICAL governance violation"`
- `"Layer 3 skills are mandatory before generation"`
- `"No scene is longer than 5 seconds"` (music-led pipelines)
- `"Do not overdescribe faces"` (news-song PS2 modules)
- `"Mark any aspect explicitly as N/A if it doesn't apply. Silent omission is the most common analyst failure."` (5-aspect framework)

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

## L2P-COMMON-4 — 5-aspect video specification framework

**Summary.** Author the shared 5-aspect framework as a Layer 2 skill referenced by every scene/asset director that builds image or video prompts.

**Description.** The 5-aspect framework (Subject / Subject Motion / Scene / Spatial Framing / Camera) is the system's most heavily encoded production learning. It appears in scene-directors, asset-directors, the video-reference-analyst meta skill, and the shot-prompt-builder helper. Authoring it once in a shared skill ensures consistency.

**Acceptance criteria.**
- [ ] Skill present at `bundled/skills/_shared/video-prompting.md`.
- [ ] **Verbatim 5-aspect block** with all sub-attribute lists:
  - **Subject**: type, attributes (count, age, role, costume, distinguishing features), multiple-subject disambiguation, transitions across shots (revealing / disappearing / switching / complex-alternating).
  - **Subject Motion**: actions in temporal order; group/interaction patterns (parallel, sequential, reactive); locomotion vs gesture vs facial.
  - **Scene**: overlays separately (text, lower thirds, graphics, watermark — call out as their own layer, do not merge into setting) + POV (drone, aerial, OTS, macro, top-down, dashcam, FPV, handheld, locked-off) + setting + time of day + dynamics (weather, particles, crowd movement).
  - **Spatial Framing**: shot size (ECU / CU / MS / WS / EWS), subject position, depth (foreground/midground/background), height-relative (above/at/below subject), and how each changes across the shot.
  - **Camera**: playback speed (real-time / slow-mo / time-lapse), lens distortion (anamorphic, fish-eye, tilt-shift), height (ground / eye / overhead), angle (high / low / Dutch), focus / DoF (rack focus, deep focus, shallow), steadiness (locked / handheld / gimbal), movement (push / pull / pan / tilt / dolly / truck / crane / orbit).
- [ ] **Required verbatim governance rule**: `"Mark any aspect explicitly as N/A if it doesn't apply (e.g., 'Subject: N/A — pure scenery shot,' or 'Scene overlays: N/A — no graphics'). Silent omission is the most common analyst failure and produces ambiguous downstream prompts."`
- [ ] **Required overlays-not-in-depth-axis callout** (verbatim): `"Overlays (text, lower thirds, graphics, watermark) are their own layer. Do not merge them into the depth axis of the Scene aspect — they live above the scene, not inside it."`
- [ ] Cinematic scene-director (L2P-5), news-song asset-director (L2P-13), music-video scene-director (L2P-12), explainer asset-director (L2P-1), and video-reference-analyst (MET-8) all cross-reference this shared skill.
- [ ] `lib/shot_prompt_builder` port preserves all phrase-map entries:
  - `_SHOT_SIZE_PHRASES` (10 entries)
  - `_MOVEMENT_PHRASES` (18 entries)
  - `_LIGHTING_PHRASES` (11 entries)
  - `_DOF_PHRASES` (3 entries)
  - `_COLOR_TEMP_PHRASES` (4 entries)

## L2P-1 — Animated-explainer pipeline + director skills

**Summary.** Pipeline manifest + research / proposal / script / scene_plan / asset / edit / compose / publish director skills + executive-producer skill.

**Description.** Topic-to-fully-generated-explainer workflow. Default playbook: clean-professional or flat-motion-graphics. Locked decisions vary by brief.

**Standard acceptance.**
- [ ] All 8 director skills + executive-producer present and validated.
- [ ] Smoke run produces an end-to-end render against a fixture topic.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/explainer/__fixtures__/required-strings.yaml`. (Note: manifest slug is `animated-explainer` but skill directory is `explainer/` — preserved from the reference convention; documented in the resolver's mapping.)

String-match suite verifies:
- **Required sections** in `executive-producer.md`: state machine, locked decisions, validated patterns, when to stop.
- **5-aspect block** referenced from `asset-director.md` (shared via L2P-COMMON-4).
- **Required governance phrases**: `"Layer 3 skills are mandatory before generation"`, `"silent runtime swap is a CRITICAL governance violation"`.
- **Required tooling**: `compose-director.md` references `.predit/skills/core/remotion.md` for the scene library; `asset-director.md` references the Layer 3 image-gen skills (`flux-best-practices`, `bfl-api`).
- [ ] Manifest skill paths use `pipelines/explainer/...` (not `pipelines/animated-explainer/...`); the resolver's directory-name-vs-slug mapping is tested.

## L2P-2 — Animation pipeline + director skills

**Summary.** Motion-graphics-first videos (logo intros, kinetic typography, animated explainers).

**Description.** Includes specific guidance on Remotion vs HyperFrames choice, GSAP plugin usage.

**Standard acceptance.**
- [ ] Asset-director references MET-7 (animation-runtime-selector).
- [ ] All director skills present.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/animation/__fixtures__/required-strings.yaml`. String-match suite verifies:

- **Required sections** in `executive-producer.md`: state machine, locked decisions including runtime, validated patterns, when to stop.
- **Required Layer 3 skill cross-references** (in `asset-director.md`): `gsap-timeline`, `gsap-plugins` (SplitText, MorphSVG, MotionPath, DrawSVG, Flip, CustomEase as named), `framer-motion`, `lottie-bodymovin`.
- **Required HyperFrames gate** (verbatim): `"HyperFrames renders MUST pass `hyperframes lint` and `hyperframes validate` before render"`.
- **Required governance phrases**: `"silent runtime swap is a CRITICAL governance violation"`, `"keep it simple: does Remotion's primitive API solve this in ≤ 20 lines? If yes, use it"`.
- **Required GSAP-inside-Remotion patterns**: paused timeline with `tl.progress(frame / durationInFrames)`, GSAP as value calculator only, register plugins at module scope.

## L2P-3 — Avatar-spokesperson pipeline + director skills

**Summary.** Presenter-led avatar or lip-sync videos.

**Description.** HeyGen-based talking head pipeline. Brand consistency, multi-scene with different backgrounds.

**Standard acceptance.**
- [ ] Asset-director threads voice + avatar selection through the script stage.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/avatar-spokesperson/__fixtures__/required-strings.yaml`. String-match suite verifies:

- **Required Pivot Decision Matrix** in `idea-director.md` (runs at G1 — after idea, before assets):
  - If `talking_head` AVAILABLE → standard path.
  - If `talking_head` UNAVAILABLE AND `lip_sync` AVAILABLE → lip-sync path (presenter plate required).
  - If neither → Narration-Over-Graphics pivot offered (or block production).
- **Required governance phrase**: `"The pivot decision happens at G1 (after IDEA). Do not wait until the ASSETS stage to discover the tool is missing."`
- **Reviewer at idea stage** flags any avatar production proceeding past idea without a `Pivot Decision` logged in the decision log (`category: capability_extension` or `fallback_decision`) as critical.
- **Required cross-references**: `.predit/skills/agents/heygen.md`, `.predit/skills/agents/avatar-video.md`, `.predit/skills/agents/faceswap.md`.

## L2P-4 — Character-animation pipeline + director skills

**Summary.** Local rigged cartoon characters with reusable cast.

**Description.** Includes additional stages: `character_design` and `rig_plan` between script and scene_plan. Produces `character_design`, `rig_plan`, `action_timeline`, `pose_library`, `character_qa_report` artifacts (see CHR epic).

**Standard acceptance.**
- [ ] Pipeline manifest declares the extra stages.
- [ ] Character-design director skill teaches the agent to consult `shows/<show>/characters/<slug>/` and respect existing character sheets.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/character-animation/__fixtures__/required-strings.yaml`. String-match suite verifies:

- **Required 5 send-back triggers** (in `executive-producer.md`, verbatim, each maps to a reviewer rule):
  1. `character_design` lacks required actions or emotional range — reviewer check: `character_design.required_actions ⊆ pose_library.poses` keys; `character_design.required_emotions ⊆ pose_library.expressions`.
  2. `rig_plan` lacks pivots for moving parts — reviewer check: every part referenced in pose_library has a corresponding joint in rig_plan.
  3. `pose_library` has no readable acting poses — reviewer check: pose_library.poses count >= 4 for any character with hero_moment in scene_plan.
  4. `action_timeline` has actions that cannot be rendered by the rig — reviewer check: `action_timeline.actions[].action ∈ pose_library.poses ∪ action_cycles`.
  5. Compose used a runtime not approved in proposal — reviewer check: `render_runtime` consistent across proposal → edit → compose unless logged decision supersedes.
- **`master_clock: action_timeline`** declared in manifest (per spec 07 4-value enum).
- **Recurring cast respect**: character-design director explicitly checks `shows/<show>/characters/<slug>/` first and uses existing character sheets when present. New characters are flagged with `new: true` in `character_design` artifact.
- **Required cross-references**: `.predit/skills/agents/character-rigging.md`, `.predit/skills/agents/svg-character-animation.md`, `.predit/skills/agents/pose-library-design.md`, `.predit/skills/agents/character-animation-qa.md`.

## L2P-5 — Cinematic pipeline + director skills

**Summary.** Trailer, teaser, mood-led edits.

**Description.** Includes the slideshow-risk check at scene_plan, motion-required guardrail throughout, climax alignment via audio subsystem.

**Standard acceptance.**
- [ ] Asset-director includes the camera-motion vocabulary.
- [ ] Compose-director enforces motion-led delivery promise.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/cinematic/__fixtures__/required-strings.yaml`. String-match suite verifies:

- **Required sections** (in `executive-producer.md`): `## Pipeline state machine`, `## Mandatory locked decisions`, `## Validated patterns`, `## When to stop and check with the human`, `## Reference materials`.
- **Required 5-aspect block** (in `scene-director.md` and `asset-director.md`, **verbatim** — see L2P-COMMON-4): the canonical Subject / Subject Motion / Scene / Spatial Framing / Camera breakdown with all sub-attribute lists (POV types, lens distortions, camera height-relative, etc.) plus the "overlays not in depth axis" callout and the "silent omission is the most common analyst failure" rule.
- **Required CHAI three-step prompt review** (in `asset-director.md`, verbatim): pre-caption / critique / post-caption review structure. The agent drafts a prompt, critiques it against the 5-aspect framework + confusable-term list, then writes the post-caption.
- **Required emotional-adjective ban** (verbatim phrase): `"Do not use emotional adjectives in image prompts (e.g., dramatic, beautiful, stunning). Use grounded visual descriptions instead."`
- **Required confusable-term list** in asset-director (verbatim): the list of terms that confuse AI image generators (e.g. "shot" — gunshot vs camera shot — must be disambiguated as "camera shot" or "camera angle").
- **Required audio_architecture decision** at proposal stage: skill explicitly tells the agent to ask the user `"Single narrator | Character dialogue | Narrator + character voices"` before script — verbatim from `specs/15-announce-and-escalate.md` cross-reference.
- **Required governance phrases**:
  - `"motion is a hard requirement; still-image fallback is forbidden"`
  - `"silent runtime swap is a CRITICAL governance violation"`
  - `"At least 3 genuinely different cinematic directions in concept_options"` (from PIP-7's minItems 3)
- **Required cross-references**: `.predit/skills/meta/reviewer.md`, `.predit/skills/meta/announce-and-escalate.md`, `.predit/skills/core/remotion.md`, `.predit/skills/agents/seedance-2-0.md`, `.predit/skills/agents/ai-video-gen.md`.

## L2P-6 — Clip-factory pipeline + director skills

**Summary.** Many short clips from one long source.

**Description.** Source-led workflow: scene detect + segment ranking + auto-reframe to vertical/square aspect.

**Acceptance criteria.**
- [ ] Idea-director includes input-media analysis.
- [ ] Asset stage uses scene-detect output to select clip windows.

## L2P-7 — Daily-news pipeline + director skills

**Summary.** TTS newsreader / daily broadcast format.

**Description.** Includes `capture` stage for source screenshots via Playwright. Research + scripted narration. Sample-first cost guard. Orchestration limits override the default to keep cadence tight.

**Standard acceptance.**
- [ ] Capture-director skill includes Playwright recipes.
- [ ] Pipeline manifest declares the capture stage.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/daily-news/__fixtures__/required-strings.yaml`. String-match suite verifies:

- **Required orchestration override** (in manifest): `orchestration.max_revisions_per_stage: 2`, `orchestration.max_send_backs: 1`. These are unique to daily-news (other pipelines default to 3/3). Runner honors these limits.
- **Required governance phrases**:
  - `"Captures are real source screenshots. Do not generate fake article pages."`
  - `"silent runtime swap is a CRITICAL governance violation"`
- **Required cross-references**: `.predit/skills/agents/playwright-recording.md`, `.predit/skills/agents/video-download.md`.
- [ ] Reviewer enforces the orchestration overrides — round-3 revisions don't run.

## L2P-8 — Documentary-montage pipeline + director skills

**Summary.** Retrieval-led documentary.

**Description.** Pulls stock from archive.org, NASA, NOAA, Library of Congress, Wikimedia, etc. CLIP-based retrieval. No formal proposal/script stages — driven by topic + retrieval.

**Standard acceptance.**
- [ ] Asset-director includes clip-search workflows.
- [ ] Includes the "tone poem" approach guidance.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/documentary-montage/__fixtures__/required-strings.yaml`. String-match suite verifies:

- **Required corpus quality bar** (verbatim from manifest review_focus): `"corpus size >= 8 * scene_plan.slots.length AND median(top_n_scores) >= 0.22"`. Below either threshold is critical (`"Grow the corpus with new queries."`).
- **Required end_tag_plan presence** (MANDATORY per manifest): scene_plan must produce an `end_tag_plan` artifact (see L2P-8.1) with `mode`, `text`, `placement_seconds_from_end`, `style_ref`.
- **Required "no narration" rule** (verbatim governance phrase): `"No narration unless the user explicitly asks. Adding voice is a MAJOR change and requires user approval per the Decision Communication Contract."` Reviewer at proposal flags narration-without-approval as critical.
- **Required "no generated clips" default**: documentary-montage uses retrieval, not generation, unless user explicitly opts in. Generation usage requires logged `fallback_decision` or `capability_extension`.
- **Required MMR diversification** (in `asset-director.md`): the `corpus.diversify` formula `score(c) = (1 - λ) × sim(c, seed) - λ × max(sim(c, picked))`, default `λ = 0.3`, candidate pool 30.
- [ ] Reviewer at scene_plan flags missing `end_tag_plan` artifact as critical.

## L2P-8.1 — End-tag plan artifact schema

**Summary.** Schema for the `end_tag_plan` artifact required by documentary-montage's scene_plan stage.

**Description.** Documentary-montage manifests declare an `end_tag_plan` as a mandatory artifact. The shape isn't covered by any of the standard artifact schemas, so it needs its own.

**Acceptance criteria.**
- [ ] Schema present at `bundled/schemas/artifacts/end_tag_plan.schema.json` and `src/artifacts/end_tag_plan.ts`.
- [ ] Fields: `mode: z.enum(['overlay', 'concat'])`, `text: string`, `placement_seconds_from_end: number`, `style_ref: string` (path or playbook field).
- [ ] Validated against fixture documentary-montage scene_plans.
- [ ] Reviewer at scene_plan in documentary-montage flags missing `end_tag_plan` artifact as critical (per L2P-8).

## L2P-9 — Framework-smoke pipeline

**Summary.** Minimal 2-stage pipeline used for end-to-end testing.

**Description.** No real generation — fixtures throughout. Used by CI smoke tests. Demonstrates the minimal-manifest case (slug + stages only, no orchestration / metadata / EP).

**Standard acceptance.**
- [ ] Pipeline runs in <30s on CI.
- [ ] Produces an asset_manifest + render_report against fixtures.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/framework-smoke/__fixtures__/required-strings.yaml`. String-match suite verifies:

- **No EP file required** — framework-smoke deliberately omits `executive-producer.md` to exercise PIP-2's "minimal manifest" load path.
- **Manifest is < 30 lines** with `slug` + `stages: [research, script]` only. No `orchestration`, `defaults`, `metadata`, `export`, `sample`. PIP-2 must load it without error.
- [ ] CI gate (CI-3): pipeline runs `predit build framework-smoke/sample --sample` end-to-end against fixtures in < 30s with zero API keys.

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

**Description.** Audio-led pipeline with cuesheet stage. Lifts the validated patterns from real productions: per-section accent colors, beat-drop tags, white-flash transitions, long-hold splits, masking strategies, HyperFrames intro vs Higgsfield image-to-video.

**Standard acceptance.**
- [ ] Executive-producer encodes the locked decisions (9:16 canvas, HyperFrames runtime, whisper-first, sample-first).
- [ ] Scene-director uses cuesheet for anchoring.
- [ ] Compose-director enforces sample sub-checkpoint.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/music-video/__fixtures__/required-strings.yaml`. String-match suite verifies the executive-producer and scene-director files contain:

- **Required sections** (in `executive-producer.md`): `## Pipeline state machine`, `## Mandatory locked decisions for this pipeline`, `## Validated patterns from named productions`, `## When to stop and check with the human`, `## Reference materials`.
- **Required numerics** (verbatim, with units):
  - `"1080×1920 vertical (9:16)"` (canvas)
  - `"5.0 seconds"` or `"5 seconds"` (max scene duration)
  - `"medium.en"` (whisper model default)
  - `"large-v3"` (whisper retry model)
  - `"$0.50"` and `"15 min"` (sample-first triggers)
  - `"$0.30/clip"` (Kling cost)
  - `"0.06s in / 0.18s out"` (white-flash transition timing)
  - `"0.65 opacity"` (white-flash opacity)
  - `"220px solid + 180px gradient"` (bottom mask dimensions)
  - `"110px solid + 90px gradient"` (top mask dimensions)
  - `"1.5-2 sec"` (beat-drop hype tag placement before first vocal)
- **Required validated-pattern modules** (each is a verbatim section with its name preserved):
  - "Per-section accent color" — one color per character/concept
  - "Beat-drop hype tags between sections — name them after the actual concept (RAG, AGENTIC SEARCH, GRAPH DB), NOT generic VERSE 1/2/3"
  - "White-flash transitions at major beat drops"
  - "Long holds (>5 sec) split into 2-3 quick cuts of the SAME image with different framing/scale"
  - "Bottom mask + top mask to hide Imagen text-rendering artifacts"
  - "HyperFrames intro animation > Higgsfield text-to-video for opening title cards"
  - "Higgsfield image-to-video for hero scene animations only"
- **Required governance phrases**:
  - `"silent runtime swap is a CRITICAL governance violation"`
  - `"NEVER guess timing from lyric structure alone — the whisper word timestamps drive caption timing"`
  - `"Sample-first is not optional for any production estimated > $0.50 or > 15 min"`
- **Required cross-references**: `.predit/skills/meta/announce-and-escalate.md`, `.predit/skills/meta/reviewer.md`, `.predit/skills/core/hyperframes.md`, `.predit/skills/agents/higgsfield-generate.md`.
- [ ] Manual smoke test: produces a music-video sample (Brad's existing reference music-video acts as the visual benchmark for the maintainer's review).

## L2P-13 — News-song pipeline + director skills

**Summary.** Music-led news with PS2-era visuals + real source screenshots.

**Description.** Audio-led + capture stage for evidence. Source flyout HUDs. No-caption default.

**Standard acceptance.**
- [ ] Capture-director includes source screenshot workflow.
- [ ] Compose-director includes the PS2 source-flyout overlay pattern.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/news-song/__fixtures__/required-strings.yaml`. String-match suite verifies idea-director, asset-director, and compose-director contain:

- **Required sections** (in `executive-producer.md`): `## Pipeline state machine`, `## Mandatory locked decisions`, `## Validated patterns from named productions`, `## Content modes`, `## When to stop and check with the human`.
- **Required content modes** (in manifest + skills): `sourced-political-news-song` and `source-free-protest-music-video`.
- **5 named PS2 prompt modules** (in `asset-director.md`, verbatim labels):
  1. **Dark political rap** — verbatim prompt fragments preserved
  2. **Hyper cinematic** — verbatim prompt fragments preserved
  3. **News dystopian** — verbatim prompt fragments preserved
  4. **Anime hybrid** — verbatim prompt fragments preserved
  5. **VHS + PS2** — verbatim prompt fragments preserved
- **Required governance phrases**:
  - `"Do not overdescribe faces. The PS2 look works through silhouette, mood, lighting, camera movement, and nostalgia."`
  - `"News screenshots are real, not generated. Mixing these creates fake-news content; do not do it."`
  - `"silent runtime swap is a CRITICAL governance violation"`
  - `"Sample-first is mandatory for any production estimated > $1 or > 15 min"`
- **Validated-pattern blocks** (verbatim section name + content):
  - Shell's Love Tap learning (deep-URL specificity for news sources)
  - BLS/FRED browser-block note (government data sites that block headless capture)
  - Source flyout HUD timing: enter after screenshot is visible, leave before the cut
  - PS2-era visual treatment: low-poly 3D characters, compressed textures, visible polygon edges
  - Per-section accent color (same pattern as music-video)
- **Required numerics**:
  - `"15-20 sec"` (no-caption PS2 sample length)
  - `"5.0 seconds"` (max scene duration)
  - `"max_revisions_per_stage: 3"`, `"max_send_backs: 3"` (orchestration defaults — distinguishable from daily-news's 2/1)
- **Required cross-references**: `.predit/skills/meta/reviewer.md`, `.predit/skills/agents/playwright-recording.md`, `.predit/skills/meta/announce-and-escalate.md`.
- [ ] Reviewer asset-stage type-separation rule: `scene_kind: news-screenshot` must reference assets where `provider = playwright_recording`; `scene_kind: lyric-art` must reference assets where `provider` is an image-generation tool. Mismatch is critical (no fake news).
- [ ] Manual smoke test: produces a 15-20s no-caption PS2 sample.

## L2P-14 — Podcast-repurpose pipeline + director skills

**Summary.** Highlights and derivatives from podcast audio.

**Description.** Source-led with chapter detection, quote extraction, social-clip generation.

**Acceptance criteria.**
- [ ] Scene-director includes chapter-based segmentation.

## L2P-15 — Screen-demo pipeline + director skills

**Summary.** Screen recordings and walkthroughs.

**Description.** Two modes: `real_capture` (cap_recorder / screen_recorder / playwright) and `synthetic_terminal` (Remotion TerminalScene). Idea-director picks the mode.

**Standard acceptance.**
- [ ] Idea-director includes the mode-selection decision.
- [ ] Asset stage routes to the chosen capture path.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/screen-demo/__fixtures__/required-strings.yaml`. String-match suite verifies:

- **Required mode-selection rule** (in `idea-director.md`, verbatim): `"Use synthetic_terminal when the demo is a CLI / install flow / terminal workflow. Use real_capture when the demo is a real app UI or requires unpredictable live behavior."`
- **Required governance phrases**: `"silent runtime swap is a CRITICAL governance violation"`, `"For synthetic_terminal, use Remotion TerminalScene — do not screen-record a fake terminal in a browser"`.
- **Required cross-references**: `.predit/skills/agents/synthetic-screen-recording.md` for synthetic mode; `.predit/skills/agents/playwright-recording.md` for browser flows; `.predit/skills/agents/cap-recorder.md` / `screen-recorder.md` for macOS / cross-platform.
- **Required Remotion TerminalScene cross-reference** (in `asset-director.md`): scene type catalog includes `terminal_scene` and links to `.predit/skills/core/remotion.md` → TerminalScene props.

## L2P-16 — Talking-head pipeline + director skills

**Summary.** Footage-led speaker videos with polish.

**Description.** Source video → transcript → cleanup → captions → final.

**Standard acceptance.**
- [ ] Asset-director includes silence-cutter usage.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/talking-head/__fixtures__/required-strings.yaml`. String-match suite verifies:

- **Required transcript confidence threshold** (in `script-director.md`, verbatim): `"If avg_word_confidence < 0.8: REVISE: 'Transcript confidence is low ({X}). Try model: large-v3 if not already used.'"`. Bundled threshold value `0.8`.
- **Required subtitle sync tolerance** (in `compose-director.md`): `±0.3s` (tighter than the explainer's `±0.5s` — talking-head speech demands sharper sync).
- **Required cross-references**: `.predit/skills/core/whisperx.md` (for the `large-v3` retry), `.predit/skills/agents/playwright-recording.md` only if user-supplied video is via URL.
- **Required source-media review enforcement**: user-supplied video MUST produce a `source_media_review` artifact (per ANL-9) before the script stage proceeds.

## L2P-17 — The ChaosFM pipeline + director skills

**Summary.** News-song subclass for The ChaosFM brand. Demonstrates the brand-via-metadata pattern.

**Description.** Inherits from news-song's stages and director skills. Brand-specific defaults live in the manifest's `metadata` block; the show's `pipelines.news-song:` entry overlays show-level branding (logo, palette, opening/end treatments).

**Standard acceptance.**
- [ ] Manifest is minimal — inherits most fields from news-song.
- [ ] PIP-2 `metadata` passthrough accepts the brand block without strict-mode rejection.

**Content-fidelity acceptance.** Fixture: `bundled/skills/pipelines/thechaosfm/__fixtures__/required-strings.yaml`. The thechaosfm pipeline is unique in that its "subclass" is implemented through the YAML manifest's `metadata` block rather than a separate executive-producer file. The fixture verifies the manifest includes:

- **`metadata.brand`** block with: `name`, `slug`, `guide` (path to BRAND_GUIDE.md), `style_playbook` (e.g. `thechaosfm-gta-political`), `logo` (path), `project_root`.
- **`metadata.content_modes`** enum with at least: `sourced-political-news-song` (`requires_sources: true`) and `source-free-protest-music-video` (`requires_sources: false`).
- **`metadata.defaults`** carrying:
  - `canvas: "1920x1080"` (landscape, not 9:16 — distinct from generic music-video)
  - `caption_mode: "none"`
  - `source_cards: "only_when_sources_exist"`
  - `opening_branding`: `enabled: true`, `font: "Pricedown"`, `title_style: "all_caps"`, `logo_mask: "circle"`, `placement: "centered below opening title"`
  - `end_branding`: `enabled: true`, `logo_mask: "circle"`, `placement: "second-to-last scene, top center"`, `subscribe_animation: "spring bounce under logo"`
  - `final_shot.keep_uncluttered: true`
- **Per-stage review_focus overrides** (manifest-level): The ChaosFM opening treatment included, ChaosFM logo + subscribe in second-to-last scene, sources-only flyouts, no lyric captions in compose.
- **`compatible_playbooks.recommended`**: `[thechaosfm-gta-political]`. `also_works`: includes `ps2-dystopian-news-rap`, `news-song-protest`.
- [ ] Demonstrates the "single show, multi-pipeline" pattern: a show can declare `pipelines: { news-song: { playbook: ps2-dystopian-news-rap }, thechaosfm: {...} }` if it wants the branded variant alongside the generic news-song. (The starter ships as a single-pipeline show; multi-pipeline composition is covered by L2P-COMMON-1.)

---

# Epic L3V — Bundled Vendor Skills (Layer 3)

Layer 3 vendor knowledge. Each issue ports one vendor skill. The list grows over time — `L3V-0` is the catch-all instruction to port new skills as they appear.

## L3V-0 — Layer 3 skill discovery and porting protocol

**Summary.** Document how to add new Layer 3 skills + identify the load-bearing critical subset.

**Description.** A `bundled/skills/agents/README.md` explaining the format, frontmatter, and contract (read before calling the corresponding tool). Plus an explicit critical subset of Layer 3 skills required for the most common production paths.

**Acceptance criteria.**
- [ ] README present; skill template referenced.
- [ ] **Critical subset (12 skills, must ship with content-fidelity tests in v0.1.0)**: `flux-best-practices`, `seedance-2-0`, `ai-video-gen` (covers Kling), `elevenlabs`, `google-tts`, `music` (covers Suno + MusicGen), `higgsfield-generate`, `remotion`, `gsap-timeline`, `gsap-plugins`, `acestep`, `whisperx`. These cover music-video, trailer, and explainer production paths end-to-end.
- [ ] Each critical Layer 3 skill must include section headers for: **model identity**, **prompt structure**, **parameter defaults**, **quality keywords**, **anti-patterns**. The string-match test suite (see L2P content-fidelity section) checks for these section presence.

## L3V-1..L3V-75 — Port individual vendor skills

**Summary.** One issue per vendor skill family.

**Description.** Each issue ports one skill (or a tightly-related family — e.g. `gsap-*` is one issue). The skill teaches provider-specific prompt structure, parameter tuning, quality keywords. See `.migration/coverage-audit.md` for the mapping table.

**Acceptance criteria per issue.**
- [ ] Skill present at `bundled/skills/agents/<name>.md`.
- [ ] Tool definitions that use this skill reference it via `agent_skills: [...]`.
- [ ] Frontmatter validated.
- [ ] For skills in the critical subset (per L3V-0): required section headers present; named parameter values preserved verbatim.

## L3V-76 — Layer 3 inventory re-walk + CI drift gate

**Summary.** Recurring CI gate that catches Layer 3 skill drift between predit and the reference inventory.

**Description.** The Layer 3 skill family is intentionally large and grows over time. A one-time port at v0.1.0 ships with an out-of-date inventory the moment the reference adds a new skill. This issue is the recurring drift detector.

**Acceptance criteria.**
- [ ] CI script at `scripts/audit-l3v-drift.ts` walks `bundled/skills/agents/` and produces an inventory comparison against `.migration/coverage-audit.md` (when `.migration/` exists locally).
- [ ] **New skills in the reference, missing from predit** → script exits non-zero AND emits a PR comment listing the missing skills.
- [ ] **Skills in predit, removed from the reference** → script logs a deprecation candidate.
- [ ] Before any L3V port issue is closed, the maintainer has run the script and confirmed the resulting diff is empty (or each diff item is annotated with a follow-up issue).
- [ ] Script is run nightly in CI (or at minor-release gate) so drift is caught early.

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

**Summary.** Integrate Higgsfield via its CLI, with wire-level request contract verified by tests.

**Description.** First-class `cli` integration with `cli-login` auth. Wraps Kling v2.1 Pro image-to-video by default. The HTTP request shape is validated by recording the wire-level request — the sibling system found that an early wrapper had the wrong API contract, and predit must avoid regressing.

**Acceptance criteria.**
- [ ] Tool detects `higgsfield` binary on PATH.
- [ ] `predit setup higgsfield` runs `higgsfield login`.
- [ ] **Wire-level request shape** verified by recording the underlying HTTP request:
  - URL ends in `kling-video/v2.1/pro/image-to-video` (not `/v2.0/` and not `/text-to-video`).
  - Header: `Authorization: Key <key>:<secret>` (not `Bearer <token>`).
  - Body shape: `{ image_url: string, prompt: string, duration: 5 | 10 }` (flat object, not nested under `parameters`).
- [ ] Image source: when the tool receives a local image path, it uploads to a public hosting backend (see VID-18) and passes the resulting URL as `image_url`.
- [ ] Cost tracked at $0.30/clip default.
- [ ] Tool produces a 5-sec clip from a reference image and prompt (manual).

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

## VID-18 — Image hosting for image-to-video providers

**Summary.** Pluggable image-hosting tool that turns a local image path into a public URL for image-to-video providers.

**Description.** Image-to-video providers (Higgsfield, Kling direct, Runway, Seedance) require publicly-accessible URLs for source images. A pluggable hosting tool abstracts the upload step so per-provider tools don't reimplement it.

**Acceptance criteria.**
- [ ] Tool registered as `capability: image_hosting`. Pluggable backends:
  - `catbox.moe` — default; free; quota ~50 uploads/day soft limit (documented in `install_instructions`).
  - `s3` — bucket configured via env var.
  - `r2` — Cloudflare R2 with similar env-var config.
- [ ] Tool signature: `host(localPath: string) → { url: string, expires_at: Date | null, cost_usd: number }`.
- [ ] **Per-provider quota tracking** in the cost tracker — repeated uploads to a capped backend (Catbox) surface a warning at 40 uploads/day.
- [ ] VID-2 (Higgsfield), VID-3 (Kling direct), and other image-to-video tools that need public URLs invoke `registry.select('image_hosting')` to upload before invoking generation.
- [ ] Test: local image at `tests/fixtures/sample.png` is uploaded via Catbox and returns a working URL (manual).

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

## MUS-5 — Music plan stage prompt + reviewer enforcement

**Summary.** A surfaced sub-protocol the agent uses at proposal time to decide music source, with reviewer enforcement at proposal stage.

**Description.** Music selection at proposal is hard contract: check `music_library/` first; check generation APIs second; offer royalty-free sources; present user explicit choices; record decision.

**Acceptance criteria.**
- [ ] Skill at `bundled/skills/meta/music-plan.md` includes the verbatim checking order:
  1. Check `music_library/` for user tracks; list with durations.
  2. Check `registry.byCapability('music_generation')` for available providers.
  3. Offer royalty-free sources (drop into `music_library/` path).
  4. Present user with **explicit choices** (which library track / which generated / royalty-free / none).
  5. Record decision in the proposal's `decision_log` with `category: "music_source"`.
- [ ] Reviewer at proposal stage flags audio-led pipelines (`master_clock != none`) whose proposal_packet lacks a `music_source` decision log entry as **critical**.
- [ ] DEC-3's required-by-stage table includes `music_source` for proposal stage on audio-led pipelines.

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

**Description.** RMS + LUFS energy windowing that feeds AUD-3 (sections) and the music-video / news-song scene directors.

**Acceptance criteria.**
- [ ] Returns per-window `{ start_s, end_s, rms, lufs }` at a configurable window size (default 0.5s).
- [ ] **Section-boundary detection**: identifies energy dips of ≥ 5 LUFS (configurable parameter `section_boundary_lufs_threshold`, default 5.0) as section boundary candidates.
- [ ] **Instrumental dip detection**: identifies windows of ≥ 0.3 seconds where transcript shows no words AND audio energy is dominated by music (used by news-song script-director for cut alignment).
- [ ] Tests cover: clear section break (energy drops > 5 LUFS); subtle break (< 5 LUFS — no flag); instrumental break (matches both thresholds).

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

**Summary.** Generate `source_media_review.json` from a directory of user-supplied media, with anti-laziness guards.

**Description.** Probe each file (ffprobe + content summary). Enforce schema-level guards that catch unreviewed-but-claimed-reviewed entries.

**Acceptance criteria.**
- [ ] Schema at `bundled/schemas/artifacts/source_media_review.schema.json`.
- [ ] `files[].reviewed` is `z.literal(true)` (or `const: true` in JSON schema). A file entry with `reviewed: false` or missing fails validation.
- [ ] Each file entry has non-empty `technical_probe` (ffprobe output). Empty probe → critical reviewer finding.
- [ ] `content_summary` MUST cite at least two probe fields (resolution, codec, duration, transcript_summary, channels, etc.). A summary that references zero probe fields fails the source-understanding reviewer pass.
- [ ] **Four quality-risk rules** detected and recorded in `planning_implications[]`:
  1. Video resolution `< 720x480` → `"Low resolution"`.
  2. Mono audio → `"Mono audio"`.
  3. Duration `< 3 seconds` → `"Very short clip"`.
  4. Image resolution `< 640x480` → `"Low resolution (image)"`.
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

## COM-3 — `video_compose` runtime router with pre-compose validation

**Summary.** Single entry point that dispatches to FFmpeg / Remotion / HyperFrames based on `render_runtime`, gated by pre-compose validation.

**Description.** Reads `edit_decisions.render_runtime`, runs pre-compose validation, then routes accordingly. Surfaces a structured blocker if validation fails or the locked runtime is unavailable.

**Acceptance criteria.**
- [ ] Routing tested for each of the three runtimes.
- [ ] **Pre-compose validation gate** runs before invoking any encoder. Checks: (a) delivery_promise honored (motion_ratio floor met for motion-led promises); (b) runtime match (edit_decisions.render_runtime == proposal.render_runtime, else logged decision); (c) asset paths exist on disk; (d) cuts cover the full duration without gaps. Failures emit a structured blocker via ACT-3 — no encoder invocation.
- [ ] The pre-validation result is included in `render_report.warnings[]` and surfaces in REV-6 as `pre_compose_validation: passed | bypassed | failed`. `bypassed` is critical.
- [ ] Unavailable runtime triggers ACT-3 escalation; never silently swaps.

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

**Summary.** Render via HyperFrames CLI from edit_decisions, gated by lint + validate.

**Description.** Shell out to `npx hyperframes` with the appropriate composition spec. Run `lint` then `validate` before `render` — non-zero exit on either is a structured blocker. Surface HyperFrames doctor warnings to the user.

**Acceptance criteria.**
- [ ] Public npm package is `hyperframes` (not `@hyperframes/cli`). The tool's `integration.install` references `hyperframes`. Document: monorepo paths like `@hyperframes/cli` return 404 on public npm.
- [ ] Adapter runs `npx hyperframes lint`, then `npx hyperframes validate`, then `npx hyperframes render`.
- [ ] Non-zero exit on `lint` or `validate` is a structured blocker via ACT-3 — no render invocation.
- [ ] `render_report.validation_steps[]` records each step's exit code and stderr summary.
- [ ] Reviewer (REV-6) flags a render_report whose `validation_steps[]` doesn't include both `lint: ok` and `validate: ok` as critical.
- [ ] A fixture composition renders end-to-end (manual or CI with HyperFrames available).

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

**Summary.** Reusable pose definitions with frame-count holds.

**Acceptance criteria.**
- [ ] Schema present at `bundled/schemas/artifacts/pose_library.schema.json`.
- [ ] `poses[<name>].hold_frames` is `z.number().int().min(0)` — frames, **not** seconds. Documentation note: "hold_frames is in frames at the project's framerate. Convert to seconds via `hold_frames / fps` only at render time."
- [ ] `poses[<name>]` shape: `{ description, hold_frames, transition_to: { [target_pose]: { transition_frames, ease } } }`.
- [ ] `expressions: { [name]: { description, joints: {...} } }` for character emotional range.
- [ ] Schema cross-validated by L2P-4 reviewer: `character_design.required_actions ⊆ poses` keys.

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

## UPL-8 — `predit.lock` file (post-v0.1.0)

**Summary.** Pin the harness version a user project was last operated against, so team collaborators don't silently drift.

**Description.** `predit init` writes a `predit.lock` file at the project root recording the installed harness version and a bundled-content checksum. `predit update` compares the lock against the currently-installed harness and errors if they differ (with `--force` to override).

**Status.** Marked **post-v0.1.0** — not blocking the public flip, but tracked.

**Acceptance criteria.**
- [ ] `predit init` writes `predit.lock` with `{ harness_version: string, bundled_checksum: string, locked_at: ISO8601 }`.
- [ ] `predit update` errors if `predit.lock` differs from the installed version unless `--force` is passed; on success, rewrites the lock.
- [ ] `predit update --check` is a non-mutating check (exit non-zero on mismatch).
- [ ] Team workflow: collaborator pulls a project, runs `pnpm i -g predit@<lock-version>` (or whatever version the lock pins), runs `predit update` to refresh `.predit/` against that version.
- [ ] Spec 10 explicitly marks this section as post-v0.1.0 and removes the "future feature" reference to make the timeline clear.

---

# Epic STR — Starter shows

## STR-1..STR-7 — Bundled starter shows (runnable on zero-key fresh clone)

**Summary.** One issue per starter: music-video, news-song, ww2-diary, product-demo, ai-workflow-demo, cinematic-trailer, documentary.

**Description.** Each starter at `bundled/starters/<name>/` includes:
- `show.yaml` with a valid `pipelines:` map (single-pipeline or multi-pipeline as appropriate)
- `brand/` stub (logo placeholder, palette, typography)
- `characters/_template/` (character.yaml + README)
- `episode.template.yaml`
- `episodes/sample-episode.yaml` pre-filled with fixture media references
- `inputs/sample-episode/` directory with fixture media (small synthesized audio + lyrics for audio-led starters; sample images for animation starters)
- `README.md` explaining the starter

**Acceptance criteria per issue.**
- [ ] Starter present; cloning it via `predit new show <slug> --from <starter>` produces a valid show that round-trips through SHW-1.
- [ ] **`predit build <show>/sample-episode --sample` succeeds end-to-end on a fresh clone with zero API keys configured.** Uses Piper TTS (local) + Pixabay/Pexels free + ffmpeg + Remotion if available. Produces a 15-second sample at `projects/<show>/sample-episode/renders/sample_v1.mp4`.
- [ ] Documented in `predit ls starters` output with name, description, pipelines, fixture-media size, expected sample duration.
- [ ] At least one starter (recommended: `animated-explainer` or `music-video`) is used by the public-flip checklist's runnable-example requirement.

---

# Epic CST — Cost tracking and budgets

## CST-1 — Cost tracker module

**Summary.** In-memory + persisted cost accounting with sample/full mode separation.

**Description.** Every tool call with non-zero cost records: tool, provider, model, units, usd, mode. Persist to `projects/<show>/<episode>/cost_log.json`.

**Acceptance criteria.**
- [ ] Tool calls update the log.
- [ ] Log persists across runs (resume picks up prior cost).
- [ ] **`mode: 'sample' | 'full'`** field on every entry. Sample costs aggregate separately so the projected-full-cost math doesn't double-count sample iteration.
- [ ] Helper `aggregateCosts(log) → { sample_total, full_total, by_capability: {...}, by_provider: {...} }`.
- [ ] Schema at `bundled/schemas/artifacts/cost_log.schema.json`.

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

## CI-5 — Coverage drift CI gate

**Summary.** A CI script that compares the reference inventory against predit's coverage-audit to surface new files / removed files between port and release.

**Description.** Two responsibilities: (1) verify every entry in `.migration/coverage-audit.md` still corresponds to a predit issue in `IMPLEMENTATION.md`; (2) walk the reference repo (when present locally) and surface new files that don't appear in the audit.

**Acceptance criteria.**
- [ ] Script at `scripts/audit-coverage-drift.ts`.
- [ ] When `.migration/` and the reference repo are both present locally, runs at minor-release gate. Output: a markdown report listing new files in the reference, audit entries with broken issue references, and any inconsistencies between audit and IMPLEMENTATION.
- [ ] PR comment when drift is detected (via GitHub Actions).
- [ ] Script gracefully handles the public-release state where `.migration/` has been removed — exits 0 with a notice.

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

**Deferred from audit findings:**

- **UPL-8** `predit.lock` file — tracked, post-v0.1.0. Single-developer use does not need it; multi-collaborator workflow can rely on documented `pnpm i -g predit@<version>` until the lock is implemented.
- **REG-4 full provider-scoring formula** — predit's v0.1.0 uses preference + availability + discovery order. Documented divergence with known consequences. Revisit in v0.2 if real production drift surfaces.
- **`predit revise --decision <id> --pick <option>`** — v0.1.0 supports note-based revise only; the by-decision workflow lands in v0.2.
- **CODEX.md / COPILOT.md / CURSOR.md** — `AGENTS.md` is the broadly-supported convention (Cursor, Codex, Claude Code all read it via the CLAUDE.md pointer). No tool-specific files planned.
- **`edit_decisions` legacy field migration** — handled at the schema level (PIP-6 supports both legacy and modern fields with a `migrateEditDecisions` helper), but a hand-port from existing OpenMontage projects is not in scope. Existing projects start fresh in predit's user-project model.

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
