# predit — Implementation Guide

This document is the authoritative work plan for building `predit`. It is structured for [alpha-loop](https://github.com/bradtaylorsf/alpha-loop)'s epic-based execution model: **11 epics**, each containing batched child issues. Alpha-loop processes child issues in checklist order; batches mark groups of items that have no inter-dependencies within the batch.

## How to use this guide

- **Epics** are the unit alpha-loop schedules. Run `alpha-loop run --epic <N>` to ship an epic's child checklist in order.
- **Batches** within an epic mark sets of child issues with no inter-batch-internal dependencies. Items in the same batch can be picked up by a second concurrent alpha-loop on the same epic without conflict.
- **Child issues** are session-sized — typically 1–4 hours of focused agent work resulting in one PR. Each carries a checkbox list when it bundles multiple sub-deliverables (e.g. "port 7 markdown skills").
- **Cross-epic dependencies** are listed at the top so you know which epics can run in parallel work trees.

## Phase summary

```
Phase A — Foundation (serial)
  Epic 1   Foundation                              13 issues, 3 batches

Phase B — Parallel epics (6–7 alpha-loops on different work trees)
  Epic 2   Runtime Harness                         10 issues, 3 batches
  Epic 3   Reviewer + Audit + Self-Review          12 issues, 4 batches
  Epic 4   Audio Subsystem                          6 issues, 2 batches
  Epic 5   Composition + Visual Tools              10 issues, 4 batches
  Epic 6   Video + Audio Generation Tools           9 issues, 3 batches
  Epic 7   Analysis + Specialty Tools               7 issues, 3 batches
  Epic 8   Bundled Content                         33 issues, 7 batches

Phase C — Integration (after Phase B)
  Epic 9   Runner Integration + Reference + Cost    5 issues, 2 batches
  Epic 10  User Project + Starters + Delivery      11 issues, 4 batches

Phase D — Demo readiness (after Phase C)
  Epic 11  Demo Readiness + Provider Validation     12 issues, 4 batches

                                                 ────────────
                                                 128 issues
```

## Cross-epic dependency map

| Dependency | What blocks what |
|---|---|
| **All Phase B → Epic 1** | Hard. Phase B cannot start until Foundation completes. |
| **Epic 9 (Runner) → Epic 2 (Runtime Harness)** | Hard. Runner integration needs Epic 2's loaders + checkpoint utilities. |
| **Epic 9 (Compose) → Epic 5 (Composition tools)** | Hard. Compose router needs Epic 5's FFmpeg + Remotion + HyperFrames adapters. |
| **Epic 9 (Audio integration) → Epic 4 (Audio Subsystem)** | Hard. Cuesheet must exist before Runner can orchestrate audio-led pipelines. |
| **Epic 8 (L2P pipelines) → Epics 4–7 tool registrations** | **Soft.** L2P manifests reference tool names as strings; integration tests pass once both sides land. |
| **Epic 10 → Epic 9** | Hard. Starters need the integrated runtime to run end-to-end. |
| **Epic 11 → Epic 10** | Hard. Demo readiness validates the delivered CLI, starter scaffolds, exports, and user-project model from Epic 10. |
| **Epic 11 provider demos → Epics 6–7** | Hard for paid-provider runs. OpenAI, ElevenLabs, Higgsfield, transcription, stock, and analysis tools must have stable registry entries and availability checks. |

**Translation:** Foundation is the gate. After it, **Epics 2–8 run truly in parallel** (no cross-blocking). Epic 9 waits for 2, 4, 5. Epic 10 waits for 9.

## Execution recipe

```bash
# Day 1: Foundation (one loop, serial)
alpha-loop run --epic 1

# Day 2 onward: Phase B parallel — spin up 6 loops in separate terminals/worktrees
alpha-loop run --epic 2   # Runtime Harness
alpha-loop run --epic 3   # Reviewer + Audit
alpha-loop run --epic 4   # Audio Subsystem
alpha-loop run --epic 5   # Composition + Visual Tools
alpha-loop run --epic 6   # Video + Audio Gen Tools
alpha-loop run --epic 7   # Analysis + Specialty Tools

# When a Phase B loop finishes, shift it to Epic 8 (the biggest queue)
alpha-loop run --epic 8   # Bundled Content (32 issues; run 2–3 loops concurrently)

# Phase C: when Epics 2, 4, 5 are done
alpha-loop run --epic 9   # Runner Integration
alpha-loop run --epic 10  # Delivery

# Phase D: demo-ready validation
alpha-loop run --epic 11  # Pipeline parity + provider-backed demo matrix
```

## Document conventions

- Each child issue's title carries the issue ID (`F-1`, `R-3`, `V-7`, etc.). IDs are stable across reorganizations.
- A `**Standard acceptance**` block lists testable criteria for the primary deliverable.
- A `**Sub-checklist**` block (when present) enumerates the granular items the issue bundles — each is a checkbox the agent ticks off as it works.
- A `**Cross-references**` block lists specs and other issues the agent should read first.
- A `**Notes**` block carries non-obvious context (e.g. "directory name differs from manifest slug").

---

# Phase A — Foundation

# Epic 1 — Foundation

**Goal.** Establish the project skeleton, CLI bones, all Zod schemas, and the Tool registry core so Phase B epics can fork in parallel work trees.

**Sequencing.** Serial. Must complete before Phase B.

**Status when complete.** A `predit` CLI binary that loads/validates show, episode, pipeline, and all artifact YAML/JSON; a Registry that can discover and probe tools; a working Vitest test loop.

## Batch 1.A — Scaffold + utilities

*Parallel-safe within batch.* Five items with no inter-dependencies; a second concurrent loop on Epic 1 can pull any of them next.

## F-1 — Project scaffolding + Vitest setup

**Standard acceptance.**
- [ ] `src/` tree with placeholder index files: `harness/`, `registry/`, `tools/`, `audio/`, `shows/`, `checkpoints/`, `decisions/`, `cli/`, `remotion/`.
- [ ] `pnpm install` succeeds against the pinned `package.json`.
- [ ] `pnpm typecheck` passes on the placeholder tree.
- [ ] `pnpm build` produces `dist/cli/index.js` that prints `"predit v0.0.0"` on invocation.
- [ ] Vitest configured; `pnpm test` exits 0 (no tests yet OK).
- [ ] `pnpm test:watch` works for iterative TDD.

**Cross-references.** `specs/02-build-stack.md`.

## F-2 — CLI skeleton with Commander

**Standard acceptance.**
- [ ] `predit --help` lists every command from `specs/03-cli.md` (init, doctor, new, build, resume, status, approve, revise, ls, show, export, import, watch, setup, tools, update).
- [ ] Every command has a stub handler that respects `--json` (NDJSON) vs human-readable.
- [ ] Unknown commands exit non-zero with a fuzzy-match suggestion.
- [ ] Global flags (`--json`, `--dry-run`, `--verbose`, `--no-color`, `--config`) defined at program level.
- [ ] `--verbose` enables a debug log channel that prints to stderr.

**Cross-references.** `specs/03-cli.md`.

## F-3 — YAML + Zod config loader

**Standard acceptance.**
- [ ] `src/config/loader.ts` exports `loadYaml<T>(path, schema)` and `loadJson<T>(path, schema)`.
- [ ] On valid input: returns typed value.
- [ ] On invalid input: throws structured `ConfigError` with file path, line, and human-readable issue list (not raw Zod errors).
- [ ] Unit tests cover: happy path, missing file, malformed YAML, schema violation.

## F-4 — Logger primitives + global flag wiring

**Standard acceptance.**
- [ ] `src/log/logger.ts` exports `info`, `warn`, `error`, `debug`, `event(name, payload)`.
- [ ] All methods callable from any subsystem without circular import issues.
- [ ] `--json` mode emits NDJSON to stdout; human-readable info goes to stderr in JSON mode.
- [ ] `--no-color` strips ANSI codes; `picocolors` honored elsewhere.
- [ ] Tests verify `--json` produces parseable NDJSON.

## F-5 — Path resolution + project root detection + env loader

**Standard acceptance.**
- [ ] `src/paths/project.ts`:
  - `findProjectRoot(cwd)` walks up looking for `CLAUDE.md` + `.predit/`; throws structured error if none.
  - `resolve(kind, name)` checks local-override path first, then `.predit/` cache.
  - Returns absolute paths for `shows/`, `pipelines/`, `playbooks/`, `skills/`, `.predit/`, `projects/`, `music_library/`.
  - `parseShowEpisode("<show>/<episode>")` returns typed file paths.
- [ ] Tests cover: project root in cwd, in ancestor, no project root anywhere.
- [ ] Env loader: precedence is `.env.local` > `.env.<command>` > `.env`, with process env always winning.
- [ ] `requireEnv(name)` throws if missing; `optionalEnv(name)` returns `undefined`.

## Batch 1.B — Zod schemas

*Parallel-safe within batch.* Five schema-authoring tasks, all independent. The artifact-schema items can absorb the audit's enumeration requirements (full enum surfaces, threshold constants).

## F-6 — Show + Episode schemas + deep-merge

**Standard acceptance.**
- [ ] `Show` schema in Zod per the multi-pipeline shape: `slug`, `display_name`, `description`, `created`, `brand`, `characters`, `skills`, `pipelines` (non-empty map of `{<name>: PipelineConfig}`), `defaults` (with `pipeline` referencing a `pipelines` key), `ingest`, `export`.
- [ ] Cross-field validation: `defaults.pipeline` ∈ `pipelines` keys; rejected with `"defaults.pipeline '<name>' is not a key in pipelines"`.
- [ ] `pipelines: z.record(z.string(), PipelineConfigSchema).refine(m => Object.keys(m).length >= 1)`. Empty map rejected.
- [ ] Each `PipelineConfig`: optional `playbook`, `runtime` (enum `ffmpeg | remotion | hyperframes`), `aspect`, `budget_usd`, `playbook_overrides`.
- [ ] `ingest.watch[].pipeline` validated against `pipelines` keys at load time.
- [ ] `Episode` schema: `slug`, `title`, `created`, `pipeline` (optional — falls back to `show.defaults.pipeline`), `playbook`, `runtime`, `aspect`, `budget_usd`, `inputs`, `cast`, `tags`. Cross-field validation: `pipeline` (when set) ∈ parent show's `pipelines` map.
- [ ] `deepMerge(base, overrides)` utility: objects merge by key; arrays replace (not concatenate); `null` removes key.
- [ ] Fixtures cover: single-pipeline show, multi-pipeline show (TheChaosFM news-song + music-video), Last Rev (screen-demo + talking-head); episode pointing at undeclared pipeline yields helpful error.

**Cross-references.** `specs/04-shows-and-episodes.md`.

## F-7 — Pipeline manifest Zod schema

**Standard acceptance.**
- [ ] Top-level fields: `slug`, `display_name`, `description`, `status`, `master_clock` (enum `audio | voiceover | action_timeline | none`), `defaults`, `stages`, `export`, `metadata`, `orchestration`, `sample`.
- [ ] Per-stage fields: `slug`, `description` (optional), `skill`, `produces`, `tools_available`, `review_focus`, `success_criteria`, `human_approval` (enum `required | optional | never`), `audio_sync` (enum `build | required | none`), `sample_mode_supported`, `estimated_cost: { sample, full }`, `requires_runtime` (compose stage only).
- [ ] `metadata: z.record(z.string(), z.unknown())` with passthrough — extra brand/content-mode keys do not trigger strict-mode rejection.
- [ ] `orchestration` block (optional): `budget_default_usd`, `max_revisions_per_stage`, `max_send_backs`, `max_wall_time_minutes`. Defaults `3.00 / 2 / 3 / 30`.
- [ ] `sample` block (optional): `duration_s_min`, `duration_s_max`, `hint`.
- [ ] **Validation rules**:
  - At most one stage may declare `audio_sync: build`.
  - `audio_sync: required` may not precede any `audio_sync: build` stage.
  - `requires_runtime` valid only on `compose` stage.
  - Stage slugs unique.
  - Canonical stages follow the canonical relative order: `research → idea → proposal → script → capture → cuesheet → character_design → rig_plan → scene_plan → assets → edit → compose → publish`.
- [ ] Minimal manifest (`slug` + `stages` only) validates — framework-smoke's 26-line manifest must load.
- [ ] Fixtures: framework-smoke, music-video (full), documentary-montage (skips proposal/script/cuesheet), daily-news (+capture), character-animation (+character_design +rig_plan), thechaosfm (with `metadata.brand`).

**Cross-references.** `specs/05-pipelines.md`.

## F-8 — Artifact schemas — creative

**Sub-checklist.** Author Zod + JSON schemas for:
- [ ] `brief` (idea stage): title, audience, platform, tone, duration_s, hook, key_points, notes.
- [ ] `research_brief` (research stage): topic exploration, sources, findings.
- [ ] `proposal_packet`: `concept_options` (`z.array().min(3)`), `production_plan.render_runtime` (enum), `production_plan.renderer_family` (enum of 8 values: `explainer-data, explainer-teacher, cinematic-trailer, documentary-montage, product-reveal, screen-demo, presenter, animation-first`), `production_plan.audio_architecture` (enum `single_narrator | character_dialogue | narrator_plus_characters | no_narration`), `delivery_promise`, `decision_log_ref`.
- [ ] `script`: sections, timing, narration text, character dialogue, enhancement cues.
- [ ] `scene_plan`: ordered scenes with rich `shot_language` (47+ enum values — see Notes), `narrative_role` (10 values), `required_assets[].source` (4 values), `scene_anchor`, `hero_moment`, `texture_keywords`, `character_actions`.
- [ ] `asset_manifest`: per-asset `id, kind, path, scene_ref, provider, model, seed, prompt, cost_usd`.
- [ ] `end_tag_plan` (for documentary-montage): `mode (overlay | concat), text, placement_seconds_from_end, style_ref`.

**Notes.** `scene_plan.shot_language` is the largest enum surface in the system:
- `shot_size` (10 values): ECU, CU, MCU, MS, MLS, LS, WS, EWS, OTS, POV.
- `camera_movement` (18 values): static, pan_left, pan_right, tilt_up, tilt_down, dolly_in, dolly_out, truck_left, truck_right, crane_up, crane_down, orbit_cw, orbit_ccw, push_in, pull_out, handheld, gimbal_walk, whip_pan.
- `lighting_key` (11 values): high_key, low_key, natural, golden_hour, blue_hour, neon, practical, motivated, soft, hard, rim.
- `lens_mm` constrained to integers `[14, 24, 35, 50, 85, 135, 200]`.
- `depth_of_field` (3 values): shallow, deep, rack_focus.
- `color_temperature` (4 values): tungsten, daylight, mixed, monochrome.
- `narrative_role` (10 values): hook, setup, inciting_incident, rising_action, beat_drop, climax, falling_action, resolution, tag, transition.
- `required_assets[].source` (4 values): generated, stock, captured, supplied.

**Cross-references.** `specs/05-pipelines.md`, audit C-11.

## F-9 — Artifact schemas — execution

**Sub-checklist.**
- [ ] `edit_decisions`: cuts (start_s, end_s, asset_id, transition_in, transition_out, provider), overlays, subtitle config, `audio.music` with `ducking: z.union([z.boolean(), z.object({enabled, threshold_db, reduction_db, attack_ms, release_ms})])`, locked `render_runtime`, locked `renderer_family`, optional `brand: {slug, name}`. **Legacy field support**: top-level `music` (legacy) coexists with `audio.music` (preferred); global `transitions[]` coexists with per-cut. `migrateEditDecisions(legacy)` helper normalizes.
- [ ] `render_report`: output path, encoding profile, duration, resolution, framerate, runtime used, asset count, `warnings[]`, `validation_steps[]`.
- [ ] `decision_log`: array of entries with `id, stage, timestamp, category, options_considered (min 2), picked, reason, confidence, user_visible, supersedes`. **Category enum (15 values)**: `pipeline_selection, provider_selection, renderer_family_selection, render_runtime_selection, playbook_selection, playbook_override, music_source, motion_commitment, voice_selection, concept_selection, fallback_decision, downgrade_approval, budget_tradeoff, capability_extension, visual_accuracy_check`. `options_considered: z.array().min(2)` — schema-enforced.
- [ ] `review`: `stage, round, decision (enum 'pass' | 'revise' | 'pass_with_warnings'), findings[] (severity 'critical' | 'suggestion' | 'nitpick' | 'investigation', title, location, description, proposed_fix, optional patch {artifact_path, new_value}, status), summary counts`.
- [ ] `cost_log`: per-entry `tool, provider, model, units, usd, mode ('sample' | 'full')`.
- [ ] `final_review`: `status` (enum `pass | revise | fail`), `recommended_action` (enum `present_to_user | re_render | revise_edit | revise_assets | block`), checks block with all enums and threshold fields per `specs/17-self-review-of-output.md`.
- [ ] `source_media_review`: per-file entries with `reviewed: z.literal(true)` (anti-laziness guard), non-empty `technical_probe`, `content_summary` citing ≥ 2 probe fields.
- [ ] `video_analysis_brief`: 5-aspect breakdown fields (Subject, Subject Motion, Scene, Spatial Framing, Camera) with sub-attribute lists; `motion_type` per scene (`motion_clip | animated_still | static_image`); `flow_variance` numeric.

**Cross-references.** `specs/14-decision-log.md`, `specs/17-self-review-of-output.md`, audit C-10, C-12, C-13, C-14, C-34, C-55.

## F-10 — Artifact schemas — character animation + checkpoint

**Sub-checklist.**
- [ ] `action_timeline`: per-character sequence of `{ time_s, pose, transition_frames, ease }`.
- [ ] `character_design`: `required_actions`, `required_emotions`, visual_description, references[].
- [ ] `character_qa_report`: findings on character renders (consistency, anatomy).
- [ ] `pose_library`: `poses: { <name>: { description, hold_frames: z.number().int().min(0), transition_to: { [target]: { transition_frames, ease } } } }`, `expressions: { <name>: { description, joints } }`. **hold_frames is integer frames, NOT seconds** — documented; convert via `hold_frames / fps` at render time only.
- [ ] `rig_plan`: rig joint specification for SVG character animation.
- [ ] `checkpoint`: `stage, status (enum 'in_progress' | 'completed' | 'awaiting_human' | 'failed'), timestamp, artifact, review_summary, cost_snapshot, tool_invocations`, optional `style_playbook` (audit trail), optional `skills_read[]` (for REV-13 Layer 3 compliance).

**Cross-references.** `specs/12-checkpoint-protocol.md`, audit C-32.

## Batch 1.C — Registry core

*Sequential within batch.* F-11 must complete before F-12 and F-13 (they implement the interface F-11 defines). F-12 and F-13 are parallel-safe relative to each other.

## F-11 — Tool interface + Integration discriminated union + `defineTool`

**Standard acceptance.**
- [ ] `Tool<I, O>` interface exported from `src/registry/tool.ts` with `name, capability, provider, status, integration, best_for, supports, cost, agent_skills, input, output, isAvailable, execute`.
- [ ] `Integration` discriminated union:
  - `{ kind: 'cli', binary: string, auth: CliAuth, install: string }`
  - `{ kind: 'api', env: string[], install: string }`
  - `{ kind: 'binary', binary: string, install: string }`
  - `{ kind: 'library', package: string, install: string }`
- [ ] `CliAuth` modes: `'cli-login' (check: string)`, `'env' (env: string[])`, `'none'`.
- [ ] `defineTool({...})` helper preserves `I, O` type inference via Zod.
- [ ] Sample tool compiles without explicit type annotations beyond schemas.

**Cross-references.** `specs/06-tool-registry.md`.

## F-12 — Registry class (discover + lookup)

**Standard acceptance.**
- [ ] `Registry.discover()` globs `src/tools/**/*.ts`, imports each, registers default exports.
- [ ] Duplicate tool names cause a fatal startup error.
- [ ] Tools missing required fields cause a fatal startup error.
- [ ] `get(name)`, `byCapability(cap)`, `byProvider(provider)` return correctly typed results.
- [ ] Tests cover: duplicate detection, missing-field rejection, happy path.

## F-13 — Availability checks per integration kind + `select()` routing

**Standard acceptance.**
- [ ] `isAvailable()` implementation per kind:
  - `cli`: `which <binary>` + run `auth.check` (default 3s timeout, configurable per tool); non-zero exit → unavailable with `reason: 'not-authenticated'`.
  - `api`: every required env var present.
  - `binary`: `which <binary>` on PATH.
  - `library`: `require.resolve(<package>)` succeeds.
- [ ] `registry.refreshAvailability()` probes every tool in parallel with concurrency cap 8 and per-probe timeout. Probe failures cached as `available: false`.
- [ ] `registry.select(cap, prefs?)` orders candidates by (1) preference list, (2) availability, (3) discovery order. Throws `NoToolAvailable` (with reasons) when no candidate is available.
- [ ] Tests cover: cli-login probe success/fail, env var present/absent, library missing, preference ordering.

**Documented simplification** (audit C-47): predit's `select()` deliberately simplifies provider ranking vs the sibling-of-record's 7-dimension weighted formula. Known consequence: pipeline routing may pick a different provider than the sibling did for the same brief. Documented at `bundled/notes/provider-scoring.md`; revisit in v0.2 if real production drift surfaces.

---

# Phase B — Parallel epics

# Epic 2 — Runtime Harness

**Goal.** All loaders, the resolver, checkpoint utilities, and the stage execution scaffolding — but NOT the integrated Runner (that's Epic 9). This epic produces independently-testable pieces that Epic 9 wires together.

**Parallel-safe with.** Epics 3, 4, 5, 6, 7, 8 (after Epic 1 completes).

## Batch 2.A — Loaders + resolver

*Parallel-safe within batch.*

## R-1 — Show + Episode loaders

**Standard acceptance.**
- [ ] `loadShow(projectRoot, slug)` returns a typed `Show` with absolute brand/characters/skills paths resolved.
- [ ] `loadEpisode(show, slug)` returns a typed `Episode` with absolute input paths.
- [ ] Missing `show.yaml` / `episode.yaml` throws with the expected path.
- [ ] Missing input files reported with `"inputs.track: file not found at <path>"`.
- [ ] `validateEpisodeAgainstShow(episode, show)` returns structured errors when `episode.pipeline` is set but not in `show.pipelines`.

## R-2 — Pipeline manifest loader

**Standard acceptance.**
- [ ] Uses Epic 1's path resolver to find the manifest: `pipelines/<slug>.yaml` project-local first, `.predit/pipelines/<slug>.yaml` bundled fallback.
- [ ] Parses with the F-7 schema.
- [ ] Unknown stage names referenced in `success_criteria` trigger validation errors.
- [ ] Returns typed `Pipeline`.

## R-3 — Character + skill resolver

**Standard acceptance.**
- [ ] `resolveCharacter(show, slug)` loads `shows/<show>/characters/<slug>/character.yaml`, returns typed character info (voice_id, visual_description, persona, references[] with absolute paths), optional `character_sheet.md` content.
- [ ] Slug matching is case-sensitive; underscores and dashes are NOT interchangeable. Mismatch error lists available characters.
- [ ] `resolveSkill(kind, name, ctx)` walks the four tiers per `specs/08-skills.md`: show override → project-local → bundled per-pipeline → bundled `_shared/`. Returns first match (absolute path + cached content).
- [ ] Missing skill in all four tiers throws with all four expected paths.

## Batch 2.B — Checkpoint + state

*Parallel-safe within batch.*

## R-4 — Checkpoint read/write + state file + resume protocol

**Standard acceptance.**
- [ ] `writeCheckpoint(show, episode, stage, checkpoint)` writes atomically (temp + rename) to `projects/<show>/<episode>/checkpoints/<stage>.json`. Interrupted writes never leave partial files.
- [ ] `readCheckpoint(...)` validates against F-10 checkpoint schema; throws `InvalidCheckpoint` on malformed content.
- [ ] `writeState(...)` updates `projects/<show>/<episode>/state.json` on every stage transition.
- [ ] `getNextStage(projectRoot, show, episode, pipeline)` scans checkpoints and returns the next stage per `specs/12-checkpoint-protocol.md` resume rules:
  - Fresh project → first stage.
  - After completed stage N → stage N+1.
  - After `awaiting_human` → that stage (not next).
  - After `failed` → surfaces failure.
  - Orphaned `in_progress` → treated as crashed.

## R-5 — Sample sub-checkpoint (versioned)

**Standard acceptance.**
- [ ] `writeSampleCheckpoint(show, episode, version, payload)` writes `projects/<show>/<episode>/checkpoints/sample_v{N}.json`.
- [ ] Each version's checkpoint records `cost_for_this_sample, cumulative_sample_cost, projected_full_cost, sample_video_path, status: 'awaiting_human'`.
- [ ] `sample.latest_version: N` tracked in state.json so the runner doesn't ls the directory.
- [ ] `predit revise <show>/<episode> "<note>"` increments the sample version and stores the note.

## R-6 — Cost tracker module

**Standard acceptance.**
- [ ] `recordCost({ tool, provider, model, units, usd, mode })` appends to `projects/<show>/<episode>/cost_log.json`.
- [ ] `aggregateCosts(log) → { sample_total, full_total, by_capability, by_provider }`.
- [ ] Mode-aware: sample-mode entries aggregate separately so projected-full math doesn't double-count.
- [ ] Schema at `bundled/schemas/artifacts/cost_log.schema.json`.

## Batch 2.C — Stage execution + CLI commands

*Parallel-safe within batch.* These produce isolated pieces; integration into the Runner happens in Epic 9.

## R-7 — Stage execution context + dispatch contract

**Standard acceptance.**
- [ ] `StageContext` type: resolved show + episode + pipeline + playbook merged, prior artifacts (loaded from checkpoints), registry handle, cuesheet (if relevant), run options (sample, budget), `markSkillRead(name)` helper for REV-13 tracking, `revision_notes[]` for CHK-6 revise.
- [ ] `StageResult` type: artifact, cost_used, decisions, review_summary.
- [ ] In-process stub dispatcher returns deterministic fixtures for tests.
- [ ] External agent interface emits a structured event the harness can wait on.
- [ ] Tests construct fixture context and assert all expected fields present.

## R-8 — Human approval presentation (fixed section order)

**Standard acceptance.**
- [ ] `formatApprovalBlock(checkpoint, ctx)` renders the five fixed sections:
  1. `## Stage complete: <stage>`
  2. Artifact summary (≤ 5 bullets)
  3. Review findings (counts + every critical finding shown in full)
  4. Cost so far (stage + total + budget remaining + projected next-stage)
  5. Action options (`approve | revise | abort`)
- [ ] Critical findings never truncated; description + proposed_fix shown.
- [ ] `--json` mode emits the same sections as distinct NDJSON events.

## R-9 — `predit build / resume / approve / revise / status` commands

**Standard acceptance.**
- [ ] `predit build <show>/<episode>` invokes the Runner stub (Epic 9 wires the real Runner) and exits cleanly.
- [ ] `predit resume <show>/<episode>` calls `getNextStage` then continues.
- [ ] `predit approve <show>/<episode>` advances past an `awaiting_human` checkpoint.
- [ ] `predit revise <show>/<episode> "<note>"` re-runs the current stage with the note appended to `StageContext.revision_notes[]`.
- [ ] `predit status [<show>[/<episode>]]` prints state + cost + last decision in human and `--json` modes.
- [ ] `--from <stage>`, `--to <stage>`, `--only <stage>`, `--budget <usd>`, `--sample`, `--non-interactive` flags all parsed and threaded.

## R-10 — `predit new / ls` commands

**Standard acceptance.**
- [ ] `predit new show <slug> [--from <starter>] [--pipelines <list>]` scaffolds a valid `shows/<slug>/show.yaml` that round-trips through F-6 schema. With `--pipelines news-song,music-video` seeds a multi-pipeline show.
- [ ] `predit new episode <show> [<slug>] [--pipeline <name>]` scaffolds with valid `pipeline:` validated against `show.pipelines`.
- [ ] `predit new pipeline <slug>` and `predit new playbook <slug>` scaffold project-local override stubs.
- [ ] `predit ls shows | episodes <show> | pipelines | playbooks | starters | tools | decisions <show>/<episode>` returns merged bundled + project-local lists with deterministic ordering (sort by capability then provider then name). `--json` emits structured rows.
- [ ] Refuses to clobber existing directories.

---

# Epic 3 — Reviewer + Audit + Self-Review

**Goal.** All reviewer infrastructure: the protocol runner, CHAI enforcement, every specialty pass, the decision log + audit, the announce/escalate contract, the final-review-of-rendered-output gates, and the sample-first protocol skill.

**Parallel-safe with.** Epics 2, 4, 5, 6, 7, 8.

## Batch 3.A — Review infrastructure

*Parallel-safe within batch.*

## V-1 — Review schema + reviewer runner + CHAI enforcement + specificity heuristic

**Standard acceptance.**
- [ ] `runReview(stage, artifact, ctx) → Review` loads `review_focus` + `success_criteria` from the manifest; validates artifact against its schema (critical on failure); evaluates focus items; returns a `Review` per F-9 schema.
- [ ] Passing artifact → `decision: 'pass'`. Schema-invalid → critical.
- [ ] Max 2 revision rounds enforced; third call returns `pass_with_warnings`.
- [ ] **CHAI enforcement**:
  - Critical finding without `proposed_fix` → auto-downgrade to `investigation`.
  - Critical finding with `proposed_fix` < 40 chars AND no `patch` → auto-downgrade.
  - Critical finding with `proposed_fix` containing no specific token (number, ALLCAPS identifier, quoted string, file path) AND no `patch` → auto-downgrade.
  - Critical with `patch` object always passes specificity gate.
  - Auto-downgrade preserves original wording in `description` and emits `proposed_fix_below_specificity_bar` event.
- [ ] **Same-class pattern-match**: when a critical finding is recorded, a follow-up scan in the same round looks for additional instances of the same defect class.
- [ ] All findings include `location` field (artifact path or frame timestamp).

**Cross-references.** `specs/13-reviewer-protocol.md`.

## V-2 — Playbook quality-rules cross-check + scoring utility module

**Standard acceptance.**
- [ ] When a playbook is active, verify palette adherence, transition allowlist, pacing min/max, asset descriptions include playbook style cues. Each violation is a `suggestion`.
- [ ] Tests cover palette mismatch, transition outside allowlist, pacing violation.
- [ ] `src/review/scoring.ts` utility module: weighted scoring, normalization, min/max helpers. 100% unit-test coverage. Consumed by V-4, V-5, V-6.

## V-3 — Reference alignment + source media review enforcement + composition validator

**Standard acceptance.**
- [ ] **Reference alignment** (when `video_analysis_brief` exists):
  - Hallucinated reference claims → critical (test fixture: proposal mentions "fast pacing" when `pacing_style: "slow_contemplative"`).
  - Carbon-copy proposals → critical.
  - Promise preservation: missing user-loved elements → suggestion.
  - **Cost-alignment**: `cumulative_cost > 1.3 × approved_budget` without intervening approval → critical.
  - New assets beyond approved proposal → suggestion.
- [ ] **Source media review enforcement**:
  - User-supplied media exists + no `source_media_review` → critical at proposal/script stage.
  - `source_media_review.files[].reviewed != true` → schema rejection (covered by F-9).
  - `technical_probe` empty → critical.
  - `content_summary` cites no probe field → critical (parses summary for probe field names).
  - `probe.duration_seconds < 10 AND content_summary mentions 'interview'|'dialogue'` → critical investigation.
- [ ] **Composition validator** integration: parses the rendered output for structural issues (cuts cover full duration, no gaps).

## Batch 3.B — Reviewer algorithms (the audit's load-bearing scorers)

*Parallel-safe within batch.* Each is an algorithm with verbatim threshold tables.

## V-4 — Delivery promise validator with PROMISE_RULES table

**Standard acceptance.**
- [ ] `validateCuts(promise, cuts) → ValidationResult` implements the 8-row PROMISE_RULES table:

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

- [ ] `_SLIDE_GRAMMAR_TYPES` frozenset (10 cut types): text_card, stat_card, callout, comparison, hero_title, ken_burns, slide_in, slide_out, fade_in, fade_out.
- [ ] `_REAL_MOTION_TYPES` frozenset (3 types): video_clip, animation, motion_graphic.
- [ ] Video file extension list: `("mp4","mov","webm","avi","mkv")`.
- [ ] Motion-led violation: `still_fallback_allowed: false AND (slide_cuts + still_cuts) > total * 0.5 AND approved_fallback != "still_led"` → critical.
- [ ] `classifyFromBrief(brief) → DeliveryPromise` maps pipeline + brief signals to a promise (cinematic → motion_led; explainer + narration → narration_over_graphics; talking-head → avatar_presenter; etc.).
- [ ] Override rules: `motion_required: false` downgrades motion_led to hybrid; `has_footage: true` upgrades non-source to source_led.
- [ ] Dropped narration on a narration-required promise → critical.

**Cross-references.** `specs/13-reviewer-protocol.md`, audit C-9.

## V-5 — Slideshow risk scorer (6 dimensions + thresholds)

**Standard acceptance.**
- [ ] `scoreSlideshowRisk(scenes, edit?, rendererFamily) → { score, verdict, dimensions: { [name]: { score, reason } } }`.
- [ ] **Six dimensions** (verbatim names): `repetition, decorative_visuals, weak_motion, weak_shot_intent, typography_overreliance, unsupported_cinematic_claims`.
- [ ] **Verdict thresholds**: average ≥ 4.0 → `fail`; ≥ 3.0 → `revise`; ≥ 2.0 → `acceptable`; else `strong`. Empty scenes → `5.0 / fail`.
- [ ] **Per-dimension flag threshold**: any dimension ≥ 3.0 produces a finding with the dimension-specific reason string.
- [ ] **Cinematic-only branch**: `unsupported_cinematic_claims` returns `0.0` and reason `"Not applicable for non-cinematic renderer_family"` when `rendererFamily` does not contain `'cinematic'`.
- [ ] **Edit-stage regression rule**: a higher score at edit than scene_plan flags `edit_regression` as a critical finding.
- [ ] **Scoring formulas (verbatim)**:
  - `repetition`: `type_ratio > 0.7 → +2.0`; `unique_desc_ratio < 0.6 → +1.5`; `size_ratio > 0.6 → +1.5`.
  - `typography_overreliance`: tiered — text/stat-card ratio `> 0.6 → 4.0`, `> 0.4 → 2.5`, `> 0.2 → 1.0`.
- [ ] **Per-dimension reason strings (verbatim)**:
  - `"X scenes use the same layout/shot size — vary the visual grammar"`
  - `"X scenes have no stated purpose (no information_role or shot_intent)"`
  - `"Camera movement exists but lacks narrative justification"`
  - `"X scenes are missing shot_intent — why does this frame exist?"`
  - `"X% of scenes are text/stat cards — video feels like animated slides"`
  - `"Claiming cinematic but missing hero moments / lighting / movement"`
- [ ] Tests cover: pass path; each dimension's threshold; empty-scenes special case; cinematic-only branch; edit-stage regression flag.

**Cross-references.** `specs/13-reviewer-protocol.md`, audit C-7, QD-16.

## V-6 — Variation checker (8-check rubric) + scene pacing verifier

**Standard acceptance.**
- [ ] `checkSceneVariation(scenes) → { score, verdict ('poor' | 'fair' | 'good' | 'excellent'), violations[] }`.
- [ ] **Eight checks** (verbatim names):
  1. `shot_size_variety` — distribution across ECU/CU/MS/WS/EWS spans ≥ 3 buckets.
  2. `consecutive_same_size_shots` — ≥ 3 consecutive scenes with same `shot_size` is a violation.
  3. `static_shot_overuse` — `> 0.5` of scenes with `camera_movement: static` is a violation.
  4. `lighting_variety` — ≥ 2 distinct `lighting_key` values.
  5. `hero_moment_distinctness` — hero scene's shot_size differs from both immediate neighbors.
  6. `description_specificity` — flag scenes whose `description` contains any of the **21 `GENERIC_PHRASES`**: `"beautiful", "stunning", "amazing", "epic", "cinematic shot", "wide shot", "close up", "the scene", "the moment", "a person", "someone", "people", "a place", "a view", "showing", "depicting", "featuring", "highlighting", "visualizing", "demonstrating", "illustrating"`.
  7. `texture_keywords_presence` — at least 1 scene has non-empty `texture_keywords[]`.
  8. `shot_intent_completeness` — every scene has non-empty `shot_intent`.
- [ ] Most checks gate on `len(scenes) >= 4`; lighter rubric for shorter plans.
- [ ] Scoring: `score = min(5.0, len(violations) * 0.6)`. Verdict: `< 2` poor (critical), `< 3` fair (suggestion), `< 4` good, else excellent.
- [ ] Worked example in skill prose (verbatim): `"Instead of 'a beautiful cityscape', try 'rain-slicked Tokyo intersection at night, neon reflections on wet asphalt'"`.
- [ ] **Scene pacing verifier** (`verifyScenePacing(scenes, pipeline)`): max scene duration ≤ pipeline's `defaults.max_scene_duration_s`; min scene duration enforced; for music-led pipelines, scenes don't bleed across section boundaries unintentionally. Tests cover a scene exceeding max (critical) and a scene split across a section boundary (suggestion).

**Cross-references.** `specs/13-reviewer-protocol.md`, audit C-8.

## Batch 3.C — Specialty passes + Layer 3 compliance

*Parallel-safe within batch.*

## V-7 — Creative differentiation pass (6 checks)

**Standard acceptance.**
- [ ] Six checks at `scene_plan` and `edit`:
  1. **Variation score** (from V-6) — `≤ 2` critical; `≤ 3` suggestion.
  2. **Playbook alignment** — cinematic trailer with `clean-professional` is suggestion.
  3. **Shot language completeness** — every scene has `shot_size` and `shot_intent`; hero moments have all 6 shot_language fields.
  4. **`renderer_family` match at edit** — `edit_decisions.renderer_family` matches proposal's. Unlogged change → critical.
  5. **`render_runtime` match at edit and compose** — runtime in edit_decisions and `render_report` matches proposal's locked runtime. Unlogged change → critical.
  6. **Runtime-selection-presented-both-options at proposal** — `render_runtime_selection` lists both Remotion and HyperFrames when both available (plus ffmpeg per DEC-4 when applicable). Single option considered when more were available → critical.
- [ ] Test fixtures cover each check independently in pass and fail forms.

**Cross-references.** audit C-15.

## V-8 — Layer 3 skill compliance pass

**Standard acceptance.**
- [ ] For each generation tool invocation in `tool_invocations[]`, verify the agent's `skills_read[]` includes every entry in the tool's `agent_skills`.
- [ ] Missing skills produce `suggestion` at first generation stage; `critical` by edit stage.
- [ ] Test fixtures: tool with `agent_skills: ['flux-best-practices', 'bfl-api']`; checkpoint missing both → critical; missing one → suggestion at asset stage; both present → no finding.

**Cross-references.** audit C-22, QD-15.

## V-9 — Final review of rendered output (technical + visual + audio + promise preservation + halt)

**Standard acceptance.**
- [ ] **Technical probe**: ffprobe duration within ±0.5s of plan; resolution exact match; container valid; codecs reasonable.
- [ ] **Visual spotcheck**: ≥ 4 frames sampled at 10/35/65/90% + hero scene frame; saved to `projects/<show>/<episode>/final_review/frames/`.
- [ ] **Audio spotcheck**:
  - `caption_sync_accuracy = words_within_±150ms / total_words`. `< 0.95` suggestion. `< 0.80` critical.
  - `subtitle_check.accuracy_within_150ms` same accuracy ratio.
  - Optional `transcript_comparison.word_accuracy` when script artifact exists — `< 0.80` critical (audio cut off).
- [ ] **Promise preservation — all four `silent_downgrade_detected` triggers**:
  1. motion-led promise + motion_ratio_actual below PROMISE_RULES floor.
  2. runtime swap (render_runtime ≠ edit_decisions.render_runtime OR ≠ proposal.render_runtime) without superseding decision.
  3. dropped narration on narration-required promise.
  4. missing reference-loved elements (when video_analysis_brief exists).
- [ ] `runtime_swap_check` populated as human-readable status string per F-9.
- [ ] **Halt-on-fail gate**: `final_review.status === 'fail'` halts the pipeline. Rendered output preserved at `projects/<show>/<episode>/renders/final-failed.mp4`. User can `predit approve --force` (writes `force_approval` decision with category `downgrade_approval`).

**Cross-references.** `specs/17-self-review-of-output.md`, audit C-14, C-51, C-52, QD-8.

## Batch 3.D — Decision log + announce/escalate + sample-first protocol

*Parallel-safe within batch.*

## V-10 — Decision log full implementation

**Standard acceptance.**
- [ ] Atomic-append `recordDecision(entry)` to `projects/<show>/<episode>/decisions.json`.
- [ ] Helper `currentDecisions(): Decision[]` returns the non-superseded subset.
- [ ] **Required-entries-by-stage audit** sourced from `bundled/decision-log/required-by-stage.yaml` (single source of truth):

| Stage | Required categories |
|---|---|
| proposal | `render_runtime_selection`, `renderer_family_selection`, `playbook_selection`, `motion_commitment`, `concept_selection`, plus `music_source` for audio-led pipelines |
| script | `voice_selection` (per character / single narrator) when pipeline produces narration |
| assets | `provider_selection` per capability; `model_selection` per provider when multiple available |
| edit | `render_runtime_selection` confirmed or superseded; `fallback_decision` or `downgrade_approval` if deviating from scene_plan |
| compose | `render_runtime_selection` (final, must match edit's); `fallback_decision`/`downgrade_approval` if substitute used |

- [ ] Missing required category at the listed stage → suggestion; by edit stage → critical.
- [ ] All-confidence-1.0 pattern → suggestion.
- [ ] Boilerplate-reason detector: flag reasons < 30 chars containing only boilerplate tokens ("best option", "good choice", "default").
- [ ] **Present-both-runtimes hard-rule enforcement**:
  - Remotion + HyperFrames both available + single option → critical.
  - Only one available + that one listed + other marked `rejected_because: "runtime not available on this machine"` → no finding.
  - `delivery_promise.motion_required = false` + ffmpeg available → ffmpeg must be in `options_considered`. Missing → critical.
  - `motion_required = true` → ffmpeg may be omitted OR included with `rejected_because: "still-image-only; brief requires motion-led delivery."`
- [ ] `predit ls decisions <show>/<episode>` renders the log as a table (human) or NDJSON (`--json`).

**Cross-references.** `specs/14-decision-log.md`, audit C-12, C-25, DEC-4.

## V-11 — Announce + escalate (the decision communication contract)

**Standard acceptance.**
- [ ] **Pre-execution announce**: wrap every `tool.execute()` for non-zero-cost tools with an announce block (tool, provider, model, reason, sample-or-batch, estimate). Interactive mode allows abort; non-interactive logs and proceeds.
- [ ] **Major-change gate** (ACT-2): detect provider swaps, model swaps, runtime swaps, dropped narration/music, sample→batch transitions. Refuse to proceed without explicit user approval + logged supersession decision.
- [ ] **Structured blocker escalation** (`escalateBlocker({attempted, failed, type, options, recommendation})`): emits the block per `specs/15-announce-and-escalate.md`; in non-interactive mode exits with structured `awaiting_human`.
- [ ] **Motion-required guardrail**: refuse silent downgrade from motion-led to still-led. Test: HyperFrames unavailable + locked motion-led promise + Remotion-fallback attempted → blocker raised before execution.
- [ ] Runtime swap between proposal and compose without approval → critical reviewer finding + halt.

**Cross-references.** `specs/15-announce-and-escalate.md`.

## V-12 — Sample-first protocol skill (MET-14)

**Standard acceptance.**
- [ ] Bundled meta skill at `bundled/skills/meta/sample-first.md`.
- [ ] **Per-pipeline triggers** encoded verbatim:
  - music-video: cost `> $0.50` OR time `> 15 min`
  - news-song: cost `> $1.00` OR time `> 15 min`
  - cinematic: ALWAYS when reference-driven OR motion-required
  - character-animation: ALWAYS
  - documentary-montage: ALWAYS when 1+ hero scene present
  - animated-explainer, animation, hybrid: cost `> $1.00` OR time `> 20 min`
  - avatar-spokesperson, talking-head: cost `> $0.50`
- [ ] **Reviewer hookup at proposal**: pipelines firing a trigger but lacking `sample_required: true` in `production_plan` → critical.
- [ ] **Override**: user-insists-skip → record `downgrade_approval` decision and proceed. Gentle-pushback phrasing included verbatim.

**Cross-references.** `specs/16-onboarding-and-discovery.md`, audit C-23.

---

# Epic 4 — Audio Subsystem

**Goal.** Every audio primitive plus the Cuesheet artifact. Brad's most-loved capability — audio-to-visual alignment precision — lives here.

**Parallel-safe with.** Epics 2, 3, 5, 6, 7, 8.

## Batch 4.A — Audio infrastructure

*Parallel-safe within batch.*

## A-1 — `audio.load()` + ffprobe utility + audio_energy probe (ANL-1)

**Standard acceptance.**
- [ ] `audio.load(path) → AudioTrack` via ffprobe with `{ duration_s, sample_rate, channels }`.
- [ ] ffprobe wrapper at `src/audio/ffprobe.ts` returns parsed JSON for arbitrary media (also consumed by Epic 9 FNL-2).
- [ ] **Audio energy probe**: returns per-window `{ start_s, end_s, rms, lufs }` at configurable window size (default 0.5s).
- [ ] **Section-boundary detection helper**: identifies energy dips ≥ 5 LUFS (configurable `section_boundary_lufs_threshold`, default 5.0).
- [ ] **Instrumental dip detection helper**: windows of ≥ 0.3s with no transcript words AND music-dominant energy.
- [ ] Tests cover a fixture mp3 returning correct duration ±0.1s; clear section break (energy drops > 5 LUFS); subtle break (< 5 LUFS → no flag); instrumental break.

**Cross-references.** `specs/07-audio-subsystem.md`, audit C-46.

## A-2 — whisper.cpp + aubio tool registration

**Standard acceptance.**
- [ ] `src/tools/whisper-cpp.ts` registered as `binary` integration. PATH probe + install instructions (Homebrew / build-from-source).
- [ ] `src/tools/aubio.ts` registered as `binary` integration. `aubio` on PATH; install `brew install aubio` documented.
- [ ] Tools available when binaries present; `unavailable` with clear reason when missing.

## A-3 — `audio.transcribe()` with model-selection rules

**Standard acceptance.**
- [ ] Shell out to whisper-cli with JSON output + word-level timings. Parse into `Segment[]` with `{ text, start_s, end_s, words[] }`.
- [ ] **Default model**: `medium.en` for English audio; `medium` (no .en) for non-English with `--language` flag.
- [ ] **Retry rule**: retry with `large-v3` when `> 20%` of tokens are music symbols (`♪`) or garbled. Logged as `provider_selection` decision.
- [ ] Average word confidence below `0.8` surfaces as reviewer suggestion at script stage.
- [ ] Confidence values populated per word.
- [ ] Falls back to alternative backends (ElevenLabs Scribe) when registered and preferred.

**Cross-references.** `specs/07-audio-subsystem.md`, audit C-24.

## Batch 4.B — Detection + alignment + Cuesheet

*Sequential.* A-4 produces sections; A-5 needs sections for climax detection; A-6 needs all primitives.

## A-4 — Section detection

**Standard acceptance.**
- [ ] `audio.detectSections(track, { min_section_s, silence_threshold_db, transcript_hint })` combines ffmpeg `silencedetect` + RMS-energy windowing + transcript-presence-per-window classification.
- [ ] Returns `Section[]` per `specs/07`: `{ label, start_s, end_s, kind (vocal | instrumental | silence), energy }`.
- [ ] Detects ≥ 3 sections in a fixture song.
- [ ] Section boundaries land within 200ms of obvious gaps.

## A-5 — Beat detection + climax detection

**Standard acceptance.**
- [ ] `audio.detectBeats(track, { expect_bpm })`: shells to `aubio beat` + `aubio tempo`. Returns `{ bpm, beats[] }`. Every 4th beat → `is_downbeat: true` (overridable when time signature known).
- [ ] BPM within ±2 of known fixture; beat count consistent with `bpm × duration_min`.
- [ ] `audio.detectClimax(track, { sections })`:
  - Local maxima separated by **≥ 3 seconds**.
  - Peak weight = `local_rms × section_length_factor`.
  - Classification (`peak | drop | arrival | release`) by surrounding **4-second** curve shape.
- [ ] Returns `ClimaxPoint[]` with `source: 'algorithm'` default; agent/user can mark `source: 'manual'` and that survives `buildCuesheet` re-runs.
- [ ] Fixture tests: clear chorus (one peak), double chorus (two peaks), false-peak instrumental break (filtered), no-peak ambient track (empty).

**Cross-references.** audit QD-6.

## A-6 — `alignScenes()` + `buildCuesheet()` + Cuesheet stage skill + command

**Standard acceptance.**
- [ ] `audio.alignScenes(scenePlan, cuesheet, { master, snap_to, align_climax_scene_to, max_scene_duration_s })` produces `SceneAnchor[]` per `specs/07`.
- [ ] Every scene gets an anchor; hero scene lands within 200ms of declared climax; no scene exceeds `max_scene_duration_s`.
- [ ] `audio.buildCuesheet(track, options)` composes transcribe + detectSections + detectBeats + detectClimax. Primitives share cached track probe — no duplicate ffprobe calls.
- [ ] **Cuesheet caching**: writes `projects/<show>/<episode>/cuesheet.json` per F-10 schema. Re-readable + validates.
- [ ] **Cuesheet stage director skill** at `bundled/skills/pipelines/_shared/cuesheet-director.md`. Instructs the agent on inspecting quality, accepting/revising section labeling, confirming climax placement. Frontmatter-validated. Referenced by music-video and trailer pipelines.
- [ ] **`predit cuesheet <show>/<episode>` command** runs the audio subsystem standalone (outside the pipeline) for debugging. Writes cuesheet.json + prints summary.

**Cross-references.** `specs/07-audio-subsystem.md`, audit C-39.

---

# Epic 5 — Composition + Visual Tools

**Goal.** Every composition runtime adapter (FFmpeg, Remotion, HyperFrames) and all image-gen + stock-image tools. The output side of the pipeline.

**Parallel-safe with.** Epics 2, 3, 4, 6, 7, 8.

## Batch 5.A — FFmpeg + Remotion

*Parallel-safe within batch.*

## C-1 — FFmpeg base tool + ffprobe utility

**Standard acceptance.**
- [ ] `src/tools/ffmpeg.ts` registered as `binary` integration. PATH probe; install instructions for macOS/Linux/Windows.
- [ ] Thin wrappers for: trim, concat, silence-detect, probe, audio extraction, normalize. Each shells out via `child_process` with structured stderr capture.
- [ ] Tests cover trim/concat smoke fixtures.
- [ ] ffprobe wrapper consumed by A-1 + Epic 9 FNL-2.

## C-2 — `video_compose` runtime router + pre-compose validation

**Standard acceptance.**
- [ ] `video_compose.execute(edit_decisions, runtime_override?)` reads `edit_decisions.render_runtime` and dispatches to FFmpeg / Remotion / HyperFrames.
- [ ] **Pre-compose validation gate** before any encoder runs:
  - delivery_promise honored (motion_ratio floor for motion-led).
  - runtime match (edit_decisions.render_runtime ≠ proposal.render_runtime requires logged supersession; else blocker).
  - asset paths exist.
  - cuts cover full duration without gaps.
- [ ] Failures emit a structured blocker via ACT-3; no encoder invocation.
- [ ] `pre_compose_validation: passed | bypassed | failed` recorded in `render_report.warnings[]`. `bypassed` is critical (V-3 flags).
- [ ] Unavailable runtime triggers ACT-3 escalation; never silently swaps.

**Cross-references.** `specs/09-export.md`, audit C-17.

## C-3 — Remotion scene library port

**Standard acceptance.**
- [ ] `src/remotion/` ports all scene types: `text_card, stat_card, callout, comparison, hero_title, terminal_scene, anime_scene, bar_chart, line_chart, pie_chart, kpi_grid, progress_bar`. Plus overlay types: `section_title, stat_reveal, hero_title, provider_chip`.
- [ ] Each scene type renders against a fixture prop.
- [ ] Snapshot tests verify visual output.
- [ ] Cross-referenced from `bundled/skills/core/remotion.md` scene type catalog.

## Batch 5.B — Composition adapters

*Sequential.* C-4 needs C-1 + C-3.

## C-4 — Remotion caption burn + HyperFrames adapter + playbook→CSS bridge

**Standard acceptance.**
- [ ] **Remotion caption burn**: word-level caption rendering consuming cuesheet word timestamps + playbook caption style. Captions render in sync with audio (±50ms vs cuesheet).
- [ ] **HyperFrames adapter**: shells to `npx hyperframes` with composition spec. Public npm package is `hyperframes` (NOT `@hyperframes/cli` — monorepo path returns 404).
- [ ] **HyperFrames lint + validate gate**: runs `npx hyperframes lint`, then `validate`, then `render`. Non-zero exit on lint/validate is a structured blocker; no render invocation. Each step recorded in `render_report.validation_steps[]`.
- [ ] Reviewer (V-9) flags `render_report.validation_steps[]` missing `lint: ok` and `validate: ok` as critical.
- [ ] **Playbook → HyperFrames CSS bridge** (`hyperframes_style_bridge` port): translates playbook palette/typography/motion into CSS variables HyperFrames consumes. Same playbook drives consistent look across Remotion + HyperFrames.

**Cross-references.** audit C-28, C-29.

## C-5 — Composition specialty tools (stitcher + trimmer + showcase card + green-screen)

**Standard acceptance.**
- [ ] `video_stitch`: concat with crossfade options. Stitches N clips with requested transitions.
- [ ] `video_trimmer`: precise trim utility (within 1 frame of requested duration).
- [ ] `showcase_card`: programmatic card composition (logo + headline + product shot). Renders from fixture spec.
- [ ] `green_screen_composite`: replaces green-screen backgrounds with generated/stock backdrops.
- [ ] `green_screen_processor`: chroma-key extraction with quality controls. Produces clean alpha mattes on fixtures.

## Batch 5.C — Image generation tools

*Parallel-safe within batch.* Each image-gen provider is independent.

## C-6 — Image-gen capability + image hosting (VID-18)

**Standard acceptance.**
- [ ] `registry.select('image_generation', prefs?)` routes per F-13.
- [ ] Optional `imageGen.generate({...})` ergonomic wrapper adapts provider params.
- [ ] **Image hosting tool** (`capability: image_hosting`) with pluggable backends:
  - `catbox.moe` (default; free; ~50 uploads/day soft limit documented).
  - `s3` (env-var-configured bucket).
  - `r2` (Cloudflare R2 with similar config).
- [ ] `host(localPath) → { url, expires_at, cost_usd }`.
- [ ] Per-provider quota tracking; warning at 40 uploads/day on Catbox.
- [ ] Consumed by Epic 6 image-to-video tools.

**Cross-references.** audit C-27.

## C-7 — API image gens (FLUX, Imagen, OpenAI, Grok, Recraft)

**Sub-checklist.**
- [ ] `flux_image` (BFL API; cost per image; `agent_skills: ['flux-best-practices', 'bfl-api']`).
- [ ] `google_imagen` (service-account env var).
- [ ] `openai_image` (gpt-image-1; reserved for "requires legible text" per project memory).
- [ ] `grok_image`.
- [ ] `recraft_image` (v3).
- [ ] Each produces an image against a fixture prompt (manual).
- [ ] Cost tracked per call.

## C-8 — Local + niche image tools

**Sub-checklist.**
- [ ] `local_diffusion` (local SD/SDXL via diffusers; runtime LOCAL_GPU; available only when local model present).
- [ ] `code_snippet` (renders code as styled images for explainer/talking-head terminal overlays). Renders to transparent PNG.
- [ ] `diagram_gen` (wraps Mermaid CLI; renders to PNG/SVG).
- [ ] `math_animate` (wraps Manim CLI as `binary`). Renders fixture scene.

## Batch 5.D — Stock images

## C-9 — Stock image sources (pexels, pixabay, unsplash)

**Standard acceptance.**
- [ ] One tool per source under `capability: image_generation` (or `stock_image` if we want a separate capability — TBD by implementer).
- [ ] Each returns ≥ 3 matches for a fixture query (manual).
- [ ] Returned assets include attribution metadata.

---

# Epic 6 — Video + Audio Generation Tools

**Goal.** Every video generation provider (cloud APIs, CLI tools, local GPU), every audio generation provider (TTS, music), and stock video sources.

**Parallel-safe with.** Epics 2, 3, 4, 5, 7, 8.

## Batch 6.A — Video gen providers

*Parallel-safe within batch.*

## G-1 — Higgsfield CLI tool (wire-level)

**Standard acceptance.**
- [ ] First-class `cli` integration with `cli-login` auth. Wraps Kling v2.1 Pro image-to-video by default.
- [ ] Tool detects `higgsfield` binary on PATH.
- [ ] `predit setup higgsfield` runs `higgsfield login`.
- [ ] **Wire-level request shape verified** by recording the underlying HTTP request:
  - URL ends in `kling-video/v2.1/pro/image-to-video` (not `/v2.0/`, not `/text-to-video`).
  - Header `Authorization: Key <key>:<secret>` (not `Bearer <token>`).
  - Body shape: `{ image_url: string, prompt: string, duration: 5 | 10 }` flat (not nested under `parameters`).
- [ ] Image source: local image paths upload via VID-18 (C-6) image hosting first.
- [ ] Cost tracked at $0.30/clip default.
- [ ] Tool produces a 5-sec clip from a reference image + prompt (manual).
- [ ] `agent_skills: ['higgsfield-generate', 'ai-video-gen']`.

**Cross-references.** audit C-26.

## G-2 — Premium video providers (Kling direct, Seedance, Runway, VEO, MiniMax)

**Sub-checklist.** Each tool produces a clip against a fixture prompt (manual); cost tracked.
- [ ] `kling_video` (direct API).
- [ ] `seedance_replicate`.
- [ ] `seedance_video` (direct).
- [ ] `runway_video`.
- [ ] `veo_video`.
- [ ] `minimax_video`.
- [ ] Each declares `agent_skills` pointing to the relevant Layer 3 skill (typically `ai-video-gen` + provider-specific).

## G-3 — Open-source / local video providers (Hunyuan, Wan, CogVideo, LTX local, LTX modal, Grok)

**Sub-checklist.**
- [ ] `hunyuan_video`, `wan_video`, `cogvideo_video` — API integrations.
- [ ] `ltx_video_local` — LOCAL_GPU integration. Detects local GPU; runs against fixture (when GPU available).
- [ ] `ltx_video_modal` — Modal-hosted LTX.
- [ ] `grok_video`.
- [ ] Each produces a clip manually.

## Batch 6.B — Video specialty + stock

*Parallel-safe within batch.*

## G-4 — Clip cache + clip search + auto-reframe

**Standard acceptance.**
- [ ] **Clip cache**: caches generated clips by `(prompt, provider, model)` tuple. Repeated calls with identical params return cached path.
- [ ] **Clip search** (CLIP-based): semantic similarity search over a corpus of generated clips. Returns ranked matches from fixture corpus.
- [ ] **Auto-reframe**: convert 16:9 → 9:16 (or other aspects) with subject tracking via face/object detection + smart crop. Fixture 16:9 clip reframes to 9:16 with subject centered.

## G-5 — Stock video sources (pexels, pixabay, mixkit, coverr, dareful, pond5_pd, videvo)

**Sub-checklist.** Each tool returns ≥ 3 matches for a fixture query (manual); attribution metadata included.
- [ ] `pexels_video`.
- [ ] `pixabay_video`.
- [ ] `mixkit`.
- [ ] `coverr`.
- [ ] `dareful`.
- [ ] `pond5_pd` (public-domain).
- [ ] `videvo`.

## G-6 — Public-domain government stock + cross-source search

**Sub-checklist.** All share similar attribution patterns; one session of focused agent work handles them together.
- [ ] `archive_org`.
- [ ] `nasa`, `noaa`, `jaxa`, `esa` (space + science).
- [ ] `loc` (Library of Congress), `nara` (National Archives).
- [ ] `wikimedia` (Wikimedia Commons).
- [ ] `unsplash` (image-only — folds here for grouping).
- [ ] **Cross-source clip search**: single query that fans out to all configured stock sources and returns aggregated ranked results. Used by documentary-montage + explainer asset stages.

## Batch 6.C — TTS + Music + Audio processing

*Parallel-safe within batch.*

## G-7 — TTS providers + music plan skill

**Sub-checklist.**
- [ ] `registry.select('tts', prefs?)` routes by preference + availability.
- [ ] `elevenlabs_tts` (voice cloning, premium voices; pulls voice IDs from `characters/<name>/voice_id.txt`). `agent_skills: ['elevenlabs']`.
- [ ] `openai_tts` (gpt-4o-mini-tts).
- [ ] `google_tts` (Chirp3-HD recommended default for cost).
- [ ] `piper_tts` (local; free; `binary` integration).
- [ ] `doubao_tts`.
- [ ] Each produces narration audio (manual).
- [ ] **Music plan skill** at `bundled/skills/meta/music-plan.md` includes verbatim checking order: music_library/ → generation APIs → royalty-free sources → present user explicit choices → record `music_source` decision.
- [ ] Reviewer at proposal flags audio-led pipelines (master_clock != none) without `music_source` decision as critical.

**Cross-references.** audit C-21.

## G-8 — Music generation tools

**Sub-checklist.**
- [ ] `music_gen` (generic wrapper / selector).
- [ ] `suno_music` (API if available; else documented as user-supplied via `music_library/`).
- [ ] `freesound_music`.
- [ ] `pixabay_music`.
- [ ] Each returns matches for a fixture query (manual).

## G-9 — Audio processing (enhance + mixer + subtitle gen + silence cutter)

**Sub-checklist.**
- [ ] `audio_enhance` (noise reduction, normalization, EQ; improves noisy fixture).
- [ ] `audio_mixer` (combine narration + music + SFX with ducking per F-9's polymorphic shape).
- [ ] `subtitle_gen` (SRT/VTT from word timestamps; produces valid SRT from cuesheet).
- [ ] `silence_cutter` (trim silences in talking-head footage; reduces fixture duration by ≥ 20% on silence-heavy clip).

---

# Epic 7 — Analysis + Specialty Tools

**Goal.** All analysis tools, avatar/lip-sync, enhancement, character animation, capture.

**Parallel-safe with.** Epics 2, 3, 4, 5, 6, 8.

## Batch 7.A — Analysis tools

*Parallel-safe within batch.*

## S-1 — Probes + samplers (audio energy, frame sampler, scene detector, face tracker)

**Sub-checklist.**
- [x] `audio_energy` — covered by A-1; registered as a discrete analysis tool here for capability discovery.
- [x] `frame_sampler` — uniform or scene-aware frame sampling. Samples N frames evenly from fixture clip. Consumed by FNL-2 (Epic 9).
- [x] `scene_detector` (PySceneDetect equivalent) — detects scene boundaries within 200ms of obvious cuts.
- [x] `face_tracker` — returns face bboxes per frame. Consumed by auto-reframe (G-4). Epic 6 ships a sidecar/fixture reader; Epic 7 upgrades this to real CV detection via the `face_tracking` capability.

## S-2 — Transcribers + corpus tools

**Sub-checklist.**
- [x] `transcriber` — capability-level marker covering whisper.cpp (Epic 4) + ElevenLabs Scribe alternatives; runtime transcription selects concrete providers and skips markers.
- [x] `transcript_fetcher` — pulls captions from YouTube/Vimeo (uses video-download). Returns parsed captions from a fixture URL.
- [x] `clip_embedder` — CLIP embeddings for similarity search (used by clip-search G-4). Embedding reproducible. Epic 6 ships a deterministic local fixture embedder; Epic 7 upgrades this to a real CLIP backend via the `clip_embedding` capability.
- [x] `corpus_builder` — indexes a directory of clips/images for search. Indexes fixture directory.

## S-3 — Video understanding + source media review + visual QA + composition validator

**Standard acceptance.**
- [x] `video_analyzer` (reference-driven workflow) — produces `video_analysis_brief` from a URL or local file with 5-aspect breakdown + `motion_type` + `flow_variance` per scene.
- [x] `video_understand` — combined frame sampling + audio transcription for "understand what's in this video" use case. Produces content summary for fixture clip.
- [x] `video_downloader` (`yt-dlp` wrapper, `binary` integration) — downloads fixture YouTube URL.
- [x] **Source media review tool** (`source_media_review`) — generates artifact per F-9:
  - Per-file `reviewed: literal(true)` enforced.
  - Non-empty `technical_probe`.
  - `content_summary` cites ≥ 2 probe fields.
  - **Four quality-risk rules** recorded in `planning_implications[]`:
    1. Video resolution `< 720x480` → `"Low resolution"`.
    2. Mono audio → `"Mono audio"`.
    3. Duration `< 3 seconds` → `"Very short clip"`.
    4. Image resolution `< 640x480` → `"Low resolution (image)"`.
- [x] `visual_qa` — deterministic sampled-frame existence gate now; richer agent-driven inspection lands with FNL-2.
- [x] `composition_validator` — structural check on rendered output (cuts cover full duration, no gaps). Consumed by FNL.

**Cross-references.** audit C-10.

## Batch 7.B — Avatar + enhancement

*Parallel-safe within batch.*

## S-4 — Avatar + lip sync (lip_sync + talking_head + heygen)

**Sub-checklist.**
- [x] `lip_sync` — provider-selection marker for concrete lip-sync providers; direct rendering deferred to provider integrations.
- [x] `talking_head` — provider-selection marker for avatar presenter generation from script, voice, and avatar selection.
- [x] `heygen_video` — HeyGen submission integration covering avatar-video, create-video, video-translate workflows; completion polling is a follow-up.

## S-5 — Enhancement (6 tools)

**Sub-checklist.** Epic 7 registers provider-selection markers for these enhancement families; concrete fixture-improving providers are deferred to provider-specific follow-ups.
- [x] `bg_remove` — provider-selection marker.
- [x] `color_grade` — provider-selection marker.
- [x] `eye_enhance` — provider-selection marker.
- [x] `face_enhance` — provider-selection marker.
- [x] `face_restore` — provider-selection marker.
- [x] `upscale` — provider-selection marker.

## Batch 7.C — Character animation + capture

*Parallel-safe within batch.*

## S-6 — Character animation tool + 5 schemas

**Sub-checklist.**
- [x] `character_animation` tool — local rigged character renderer. Renders deterministic fixture animation output.
- [x] All 5 character schemas covered by F-10 (re-export / register here for capability discovery): `action_timeline`, `character_design`, `character_qa_report`, `pose_library`, `rig_plan`.
- [x] Cross-artifact validators per QD-12 send-back triggers:
  - `character_design.required_actions ⊆ pose_library.poses` keys.
  - `character_design.required_emotions ⊆ pose_library.expressions`.
  - `rig_plan.joints` covers all parts referenced in pose_library.
  - `action_timeline.actions[].action ∈ pose_library.poses ∪ action_cycles`.

## S-7 — Capture tools (4)

**Sub-checklist.**
- [x] `cap_recorder` — macOS screen recorder via system CLI. Records fixture window.
- [x] `screen_recorder` — generic cross-platform screen capture. Records on macOS + Linux.
- [x] `screen_capture_selector` — provider-selection marker documenting `registry.select('screen_capture')` routing across cap_recorder / screen_recorder / playwright.
- [x] `playwright_recording` — browser flow recording. Records fixture page flow.

---

# Epic 8 — Bundled Content

**Goal.** All markdown skills (meta + core + vendor / Layer 3), all playbooks, every pipeline manifest + per-pipeline director skills. The instruction-driven brain of the system.

**Parallel-safe with.** Epics 2, 3, 4, 5, 6, 7. This is the largest epic by issue count — consider running 2–3 alpha-loops on it concurrently once Phase B begins draining.

## Content-fidelity testing infrastructure

Every L2P (pipeline) issue ships a string-match fixture at `bundled/skills/pipelines/<pipeline>/__fixtures__/required-strings.yaml` with:
- `required_sections[]` — verbatim headers in named skills.
- `required_phrases[]` — verbatim governance phrases.
- `required_numerics[]` — exact numeric constants with units (e.g. `"5.0 seconds"`, `"0.65 opacity"`).
- `required_modules[]` — named prose blocks (e.g. "RAG Shelf Sprint validated patterns", "5 PS2 prompt modules").

A vitest suite under `tests/content-fidelity/` greps the corresponding skill markdown for every required item. Missing items fail. Fixtures are Apache-2.0 authored content shipped with the harness. The CI drift gate (E10 Delivery / D-9) reports newly added items in the reference inventory.

## Batch 8.A — Meta + core skills + playbooks

*Parallel-safe within batch.*

## B-1 — Core operational meta skills (7 skills)

**Sub-checklist.** Each at `bundled/skills/meta/<name>.md`, frontmatter validated.
- [ ] `onboarding.md` — full 6-step protocol with vague-vs-specific classifier (2-of-4 signals); composition runtimes as separate row; setup offers grouped by effort tier; anti-patterns.
- [ ] `creative-intake.md` — 7 conversational questions; reference-video redirect.
- [ ] `reviewer.md` — CHAI rules; severity ladder; 2-round cap; specialty passes per `specs/13`.
- [ ] `checkpoint-protocol.md` — when/how to checkpoint, resume, present approval blocks.
- [ ] `decision-log.md` — 15-category enum verbatim; required-entries-by-stage table; present-both-runtimes hard rule with ffmpeg clause. Cross-refs announce-and-escalate.md + reviewer.md (decision-log audit).
- [ ] `announce-and-escalate.md` — pre-execution announce template; major-change gate; structured blocker template; motion-required guardrail.
- [ ] `sample-first.md` — covered by V-12; re-link here for navigability.

**Cross-references.** specs 12, 13, 14, 15, 16.

## B-2 — Specialty meta skills (7 skills)

**Sub-checklist.** Each at `bundled/skills/meta/<name>.md`.
- [ ] `animation-runtime-selector.md` — Remotion vs HyperFrames vs FFmpeg decision matrix + animation library decision matrix (which GSAP plugin, framer-motion, Lottie, Manim, D3) + keep-it-simple bias + deterministic-GSAP-inside-Remotion patterns.
- [ ] `video-reference-analyst.md` — full reference-driven workflow: analyze → present 5-aspect breakdown → capability audit → critical questions → lightweight research → 2-3 differentiated proposals → mandatory sample → hard redirect into pipeline. Anti-patterns include no-carbon-copy.
- [ ] `skill-creator.md` — 4 skill types, standard structure, key principles, register-the-skill instructions.
- [ ] `self-review-of-output.md` — 5 required checks; threshold table; halt-on-fail.
- [ ] `capability-extension.md` — 4-row gap-type table, 6 hard conditions verbatim, decision-log entry format, "must not modify existing tools" rule.
- [ ] `source-media-review.md` — ffprobe + transcript sampling + content_summary writing, references ≥ 2 probe fields rule, hallucination guards.
- [ ] `executive-producer.md` template — three accepted patterns (state-machine EP, declarative-rules EP, cross-stage-philosophy EP) per audit C-3.

**Cross-references.** audit C-3, C-22, C-36, MET-14.

## B-3 — Bundled core craft skills (6 skills)

**Sub-checklist.** Each at `bundled/skills/core/<name>.md`.
- [ ] `ffmpeg.md` — 10+ practical recipes for concat, trim, silence-detect, probe, normalization, subtitle burn.
- [ ] `remotion.md` — scene type catalog (links to C-3), prop schemas, when to use spring vs interpolate, common pitfalls.
- [ ] `hyperframes.md` — full Remotion-vs-HyperFrames decision matrix, audio-reactive primitives, CSS variable bridge, registry blocks.
- [ ] `color-grading.md` — LUT application, contrast/saturation tuning, look references. Cross-ref'd from cinematic asset-director (L-4).
- [ ] `subtitle-sync.md` — word-level + segment-level patterns; cuesheet-driven caption highlight; snap-to-word vs snap-to-segment tradeoffs.
- [ ] `whisperx.md` — advanced patterns (diarization, long audio); music-vocal model selection (`medium.en` default; `medium` non-English; `large-v3` retry).

**Cross-references.** audit C-24, S-9.

## B-4 — Bundled playbooks (schema + generator + 10 starter playbooks + callout template)

**Standard acceptance.**
- [ ] **Playbook Zod + JSON schema** at `bundled/schemas/styles/playbook.schema.json`. Fields: palette, typography, motion rules (allowed transitions, pacing min/max), audio mood, asset preferences, quality_rules.
- [ ] **Playbook generator helper** at `src/playbooks/generator.ts` — given a brief or VideoAnalysisBrief, generates a stub playbook with palette + typography + motion rules inferred.
- [ ] **10 starter playbooks ported** to `bundled/playbooks/`, each schema-valid:
  - [ ] `clean-professional.yaml`
  - [ ] `flat-motion-graphics.yaml`
  - [ ] `minimalist-diagram.yaml`
  - [ ] `anime-ghibli.yaml`
  - [ ] `news-broadcast.yaml`
  - [ ] `news-song-protest.yaml`
  - [ ] `news-song.yaml`
  - [ ] `playful-hip-hop-explainer.yaml`
  - [ ] `ps2-dystopian-news-rap.yaml`
  - [ ] `thechaosfm-gta-political.yaml`
- [ ] **Callout template** at `bundled/playbooks/callouts_16x9.template.yaml` (PBK-13).

## Batch 8.B — Layer 3 vendor skills (grouped by family)

*Parallel-safe within batch.* Each issue ports a related family in one session. Markdown copies with light frontmatter + cross-reference updates.

## B-5 — L3V infrastructure + critical-subset declaration

**Standard acceptance.**
- [x] `bundled/skills/agents/README.md` documents the skill format, frontmatter, contract (read before calling the tool).
- [x] Skill template referenced.
- [x] **Critical-subset (12 skills)** declared explicitly: `flux-best-practices, seedance-2-0, ai-video-gen, elevenlabs, google-tts, music, higgsfield-generate, remotion, gsap-timeline, gsap-plugins, acestep, whisperx`. These 12 must ship with content-fidelity tests verifying section headers (model identity, prompt structure, parameter defaults, quality keywords, anti-patterns).

## B-6 — Image-gen vendor skills

**Sub-checklist.** Port each to `bundled/skills/agents/<name>.md` with frontmatter; preserve section headers + named parameter values.
- [x] `bfl-api`.
- [x] `flux-best-practices` (critical subset).
- [x] Any image-gen-specific skills (e.g. `grok-media` if image-relevant).

## B-7 — Video-gen vendor skills

**Sub-checklist.**
- [x] `ai-video-gen` (critical subset).
- [x] `seedance-2-0` (critical subset).
- [x] `ltx2`.
- [x] Provider-specific (kling, runway, veo, minimax notes that are commonly distinct).

## B-8 — Audio vendor skills

**Sub-checklist.**
- [x] `elevenlabs` (critical subset).
- [x] `google-tts` (critical subset).
- [x] `music` (critical subset — covers Suno + MusicGen).
- [x] `acestep` (critical subset).
- [x] `text-to-speech`.
- [x] `doubao-tts`.
- [x] `sound-effects`.
- [x] `setup-api-key` (helper).

## B-9 — Avatar + lip-sync vendor skills

**Sub-checklist.**
- [x] `avatar-video`.
- [x] `heygen`.
- [x] `create-video`.
- [x] `faceswap`.
- [x] `video-translate`.
- [x] `agents`.
- [x] `speech-to-text`.

## B-10 — Capture + post-edit vendor skills

**Sub-checklist.**
- [x] `playwright-recording`.
- [x] `ffmpeg` (post-edit recipes).
- [x] `video-edit`.
- [x] `video-download`.
- [x] `video-understand`.
- [x] `video_toolkit`.

## B-11 — Visualization vendor skills

**Sub-checklist.**
- [x] `beautiful-mermaid`.
- [x] `d3-viz`.
- [x] `manim-composer`.
- [x] `manimce-best-practices`.
- [x] `manimgl-best-practices`.
- [x] `visual-style`.

## B-12 — Animation library vendor skills (GSAP family + framer-motion + Lottie)

**Sub-checklist.**
- [x] `gsap-core`.
- [x] `gsap-timeline` (critical subset).
- [x] `gsap-plugins` (critical subset — SplitText, MorphSVG, MotionPath, DrawSVG, Flip, CustomEase).
- [x] `gsap-react`.
- [x] `gsap-utils`.
- [x] `gsap-performance`.
- [x] `gsap-scrolltrigger`.
- [x] `gsap-frameworks`.
- [x] `framer-motion` (Disney 12 principles).
- [x] `lottie-bodymovin`.

## B-13 — Character animation vendor skills

**Sub-checklist.**
- [x] `character-rigging`.
- [x] `svg-character-animation`.
- [x] `pose-library-design`.
- [x] `canvas-procedural-animation`.
- [x] `character-animation-qa`.

## B-14 — Remotion + HyperFrames vendor skills

**Sub-checklist.**
- [x] `remotion` (critical subset).
- [x] `remotion-best-practices`.
- [x] `synthetic-screen-recording`.
- [x] `hyperframes`.
- [x] `hyperframes-cli`.
- [x] `hyperframes-registry`.
- [x] `website-to-hyperframes`.

## B-15 — Higgsfield family + Three.js + web design vendor skills

**Sub-checklist.**
- [x] `higgsfield-generate` (critical subset).
- [x] `higgsfield-soul-id`.
- [x] `higgsfield-character-train`.
- [x] `higgsfield-product-photoshoot`.
- [x] `higgsfield-listing-image`.
- [x] `marketing-studio`.
- [x] Three.js family (10 skills): `threejs-fundamentals`, `threejs-lighting`, `threejs-geometry`, `threejs-materials`, `threejs-textures`, `threejs-animation`, `threejs-interaction`, `threejs-postprocessing`, `threejs-shaders`, `threejs-loaders`.
- [x] Web design: `tailwind-design-system`, `vercel-react-best-practices`, `vercel-composition-patterns`, `web-design-guidelines`.

## Batch 8.C — Bundled pipelines part 1 (foundational + simpler pipelines)

*Parallel-safe within batch.* Each pipeline is a full session. See "Content-fidelity testing infrastructure" above for fixture requirements.

## L-1 — Framework-smoke pipeline (no EP required)

**Standard acceptance.**
- [x] Manifest < 30 lines: `slug: framework-smoke`, two stages (`research`, `script`), no orchestration block, no metadata, no EP file.
- [x] PIP-2 minimal-manifest path validates without error.
- [ ] CI gate (D-9): `predit build framework-smoke/sample --sample` runs end-to-end in < 30s with zero API keys. Blocked on Epic 9 runner integration.

## L-2 — Animated-explainer pipeline + director skills

**Standard acceptance.**
- [ ] Manifest slug `animated-explainer`; skill directory `explainer/` (preserved naming — resolver maps slug → directory).
- [ ] 8 director skills + executive-producer + fixture file.
- [ ] **Content-fidelity**: required sections in EP (state machine, locked decisions, validated patterns, when to stop); 5-aspect block reference via L-18 shared helper; required phrases `"Layer 3 skills are mandatory before generation"` and `"silent runtime swap is a CRITICAL governance violation"`; compose-director references `bundled/skills/core/remotion.md`; asset-director references `flux-best-practices` and `bfl-api`.

## L-3 — Animation pipeline + director skills

**Standard acceptance.**
- [ ] Pipeline + 8 director skills + EP + fixture.
- [ ] **Content-fidelity**: required Layer 3 cross-references — `gsap-timeline`, `gsap-plugins` (named: SplitText, MorphSVG, MotionPath, DrawSVG, Flip, CustomEase), `framer-motion`, `lottie-bodymovin`; required HyperFrames gate phrase `"HyperFrames renders MUST pass `hyperframes lint` and `hyperframes validate` before render"`; "keep it simple" bias verbatim; GSAP-inside-Remotion patterns (paused timeline with `tl.progress(frame / durationInFrames)`, GSAP as value calculator).

## L-4 — Cinematic pipeline + director skills

**Standard acceptance.**
- [ ] Pipeline + 8 director skills + EP + fixture.
- [ ] **Content-fidelity**:
  - 5-aspect block verbatim in scene-director + asset-director with all sub-attribute lists + the overlays-not-in-depth-axis callout + the silent-omission-is-the-most-common-analyst-failure rule.
  - CHAI three-step prompt review (pre-caption / critique / post-caption) verbatim in asset-director.
  - Emotional-adjective ban phrase verbatim.
  - Confusable-term list in asset-director.
  - Audio architecture decision at proposal stage (single_narrator / character_dialogue / narrator_plus_characters).
  - Required phrases `"motion is a hard requirement; still-image fallback is forbidden"` + `"At least 3 genuinely different cinematic directions in concept_options"`.
  - Cross-refs `seedance-2-0`, `ai-video-gen`, `remotion`.

**Cross-references.** audit C-6, C-16, L2P-COMMON-4.

## L-5 — Talking-head pipeline + director skills

**Standard acceptance.**
- [ ] Pipeline + 8 director skills + EP + fixture.
- [ ] **Content-fidelity**: transcript confidence threshold `0.8` verbatim with REVISE phrasing; subtitle sync tolerance `±0.3s` (tighter than explainer's `±0.5s`); cross-refs `whisperx` for the `large-v3` retry; user-supplied video produces `source_media_review` before script proceeds.

## Batch 8.D — Bundled pipelines part 2 (footage-led + screen)

*Parallel-safe within batch.*

## L-6 — Hybrid pipeline + director skills

**Standard acceptance.**
- [x] Pipeline + 8 director skills + EP + fixture.
- [x] **Content-fidelity**: scene-director includes source-vs-generated decisioning; clear handoff between captured material and generated support visuals.

## L-7 — Clip-factory pipeline + director skills

**Standard acceptance.**
- [ ] Pipeline + 7 director skills + EP + fixture.
- [ ] **Content-fidelity**: idea-director includes input-media analysis; asset stage uses scene-detect output (S-1) to select clip windows; auto-reframe (G-4) cross-referenced.

## L-8 — Podcast-repurpose pipeline + director skills

**Standard acceptance.**
- [ ] Pipeline + 7 director skills + EP + fixture.
- [ ] **Content-fidelity**: scene-director includes chapter-based segmentation logic.

## L-9 — Screen-demo pipeline + director skills

**Standard acceptance.**
- [ ] Pipeline + 7 director skills + EP + fixture.
- [ ] **Content-fidelity**: mode-selection rule verbatim in idea-director — `"Use synthetic_terminal when the demo is a CLI / install flow / terminal workflow. Use real_capture when the demo is a real app UI or requires unpredictable live behavior."` Required cross-refs: `synthetic-screen-recording`, `playwright-recording`, capture tools. Scene library catalog includes `terminal_scene`.

## L-10 — Avatar-spokesperson pipeline + director skills

**Standard acceptance.**
- [ ] Pipeline + 7 director skills + EP + fixture.
- [ ] **Content-fidelity**: Pivot Decision Matrix at G1 (after IDEA) in idea-director verbatim:
  - If `talking_head` available → standard.
  - If `talking_head` unavailable + `lip_sync` available → lip-sync path (presenter plate required).
  - If neither → Narration-Over-Graphics pivot offered or block production.
- [ ] Required phrase `"The pivot decision happens at G1 (after IDEA). Do not wait until the ASSETS stage to discover the tool is missing."`
- [ ] Reviewer at idea stage flags avatar production proceeding past idea without a Pivot Decision logged as critical.
- [ ] Cross-refs `heygen`, `avatar-video`, `faceswap`.

**Cross-references.** audit QD-11.

## Batch 8.E — Bundled pipelines part 3 (localization + news + retrieval + character)

*Parallel-safe within batch.*

## L-11 — Localization-dub pipeline + director skills

**Standard acceptance.**
- [x] Pipeline + 8 director skills + EP + fixture.
- [x] **Content-fidelity**: script-director includes translation workflow; uses heygen video-translate; target-language voice casting; locale-aware subtitle rendering.

## L-12 — Daily-news pipeline + director skills

**Standard acceptance.**
- [x] Pipeline + 9 director skills (+ capture-director) + EP + fixture.
- [x] **Content-fidelity**: orchestration override in manifest verbatim — `max_revisions_per_stage: 2`, `max_send_backs: 1` (unique to daily-news; runner enforces). Required phrases `"Captures are real source screenshots. Do not generate fake article pages."` + `"silent runtime swap is a CRITICAL governance violation"`. Cross-refs `playwright-recording`, `video-download`. Reviewer enforces 2/1 limits — round-3 revisions don't run.

**Cross-references.** audit C-33.

## L-13 — Documentary-montage pipeline + director skills

**Standard acceptance.**
- [ ] Pipeline + 5 director skills (no proposal, no script) + EP + fixture.
- [ ] **Content-fidelity**: corpus quality bar verbatim — `"corpus size >= 8 * scene_plan.slots.length AND median(top_n_scores) >= 0.22"`. Below either threshold → critical with `"Grow the corpus with new queries."` Required `end_tag_plan` artifact (covered in F-8). No-narration default rule verbatim — `"No narration unless the user explicitly asks. Adding voice is a MAJOR change and requires user approval per the Decision Communication Contract."` MMR diversification formula `score(c) = (1 - λ) × sim(c, seed) - λ × max(sim(c, picked))`, default `λ = 0.3`, pool 30. No-generated-clips default (use retrieval; generation requires logged `fallback_decision` or `capability_extension`).
- [ ] Reviewer at scene_plan flags missing `end_tag_plan` artifact as critical.

**Cross-references.** audit C-31, C-56, QD-10, QD-17.

## L-14 — Character-animation pipeline + director skills

**Standard acceptance.**
- [ ] Pipeline + 10 director skills (incl. `character-design-director` + `rig-plan-director`) + EP + fixture.
- [ ] Manifest declares `master_clock: action_timeline`.
- [ ] **Content-fidelity — 5 send-back triggers verbatim in EP**, each maps to a reviewer rule:
  1. character_design lacks required actions or emotional range.
  2. rig_plan lacks pivots for moving parts.
  3. pose_library has no readable acting poses.
  4. action_timeline has actions that cannot be rendered by the rig.
  5. Compose used a runtime not approved in proposal.
- [ ] **Recurring cast respect** verbatim: character-design director consults `shows/<show>/characters/<slug>/` first; new characters flagged `new: true`.
- [ ] Cross-refs `character-rigging`, `svg-character-animation`, `pose-library-design`, `character-animation-qa`.

**Cross-references.** audit C-57, QD-12.

## Batch 8.F — Bundled pipelines part 4 (Brad's active workflows + thechaosfm)

*Parallel-safe within batch.* These pipelines have the densest content-fidelity requirements — RAG Shelf Sprint patterns, 5 PS2 prompt modules, thechaosfm brand metadata.

## L-15 — Music-video pipeline + director skills (Brad's primary workflow)

**Standard acceptance.**
- [ ] Pipeline + 8 director skills + EP + fixture.
- [ ] **Content-fidelity — full RAG Shelf Sprint validated-patterns block** verbatim in EP:
  - Required sections: `## Pipeline state machine`, `## Mandatory locked decisions`, `## Validated patterns from named productions`, `## When to stop and check with the human`, `## Reference materials`.
  - Required numerics (verbatim, with units):
    - `"1080×1920 vertical (9:16)"` canvas
    - `"5.0 seconds"` max scene duration
    - `"medium.en"` whisper default; `"large-v3"` retry
    - `"$0.50"` and `"15 min"` sample-first triggers
    - `"$0.30/clip"` Kling cost
    - `"0.06s in / 0.18s out"` white-flash transition timing
    - `"0.65 opacity"` white-flash opacity
    - `"220px solid + 180px gradient"` bottom mask dimensions
    - `"110px solid + 90px gradient"` top mask dimensions
    - `"1.5-2 sec"` beat-drop hype tag placement before first vocal
  - Required validated-pattern modules (verbatim section names + content):
    - "Per-section accent color" — one color per character/concept.
    - "Beat-drop hype tags between sections — name them after the actual concept (RAG, AGENTIC SEARCH, GRAPH DB), NOT generic VERSE 1/2/3".
    - "White-flash transitions at major beat drops".
    - "Long holds (>5 sec) split into 2-3 quick cuts of the SAME image with different framing/scale".
    - "Bottom mask + top mask to hide Imagen text-rendering artifacts".
    - "HyperFrames intro animation > Higgsfield text-to-video for opening title cards".
    - "Higgsfield image-to-video for hero scene animations only".
  - Required governance phrases: `"silent runtime swap is a CRITICAL governance violation"`, `"NEVER guess timing from lyric structure alone — the whisper word timestamps drive caption timing"`, `"Sample-first is not optional for any production estimated > $0.50 or > 15 min"`.
  - Required cross-refs: `.predit/skills/meta/announce-and-escalate.md`, `.predit/skills/meta/reviewer.md`, `.predit/skills/core/hyperframes.md`, `.predit/skills/agents/higgsfield-generate.md`.
- [ ] Manual smoke test: produces a music-video sample; Brad's reference music-video acts as visual benchmark.

**Cross-references.** audit C-41, QD-1.

## L-16 — News-song pipeline + director skills (Brad's primary workflow)

**Standard acceptance.**
- [ ] Pipeline + 9 director skills (incl. capture-director) + EP + fixture.
- [ ] **Content-fidelity**:
  - Required sections in EP: state machine, mandatory locked decisions, validated patterns, content modes (sourced vs source-free), when to stop.
  - Required content modes (manifest + skills): `sourced-political-news-song`, `source-free-protest-music-video`.
  - **5 named PS2 prompt modules** in asset-director (verbatim labels with their verbatim prompt fragments):
    1. **Dark political rap**.
    2. **Hyper cinematic**.
    3. **News dystopian**.
    4. **Anime hybrid**.
    5. **VHS + PS2**.
  - Required governance phrases verbatim:
    - `"Do not overdescribe faces. The PS2 look works through silhouette, mood, lighting, camera movement, and nostalgia."`
    - `"News screenshots are real, not generated. Mixing these creates fake-news content; do not do it."`
    - `"silent runtime swap is a CRITICAL governance violation"`
    - `"Sample-first is mandatory for any production estimated > $1 or > 15 min"`
  - Validated-pattern blocks: Shell's Love Tap learning (deep-URL specificity); BLS/FRED browser-block note; source flyout HUD timing rules; PS2-era visual treatment (low-poly, compressed textures, polygon edges); per-section accent color (matches music-video pattern).
  - Required numerics: `"15-20 sec"` no-caption PS2 sample length; `"5.0 seconds"` max scene; `"max_revisions_per_stage: 3"`, `"max_send_backs: 3"` (distinct from daily-news 2/1).
- [ ] Reviewer asset-stage **type-separation rule**: `scene_kind: news-screenshot` MUST reference assets with `provider = playwright_recording`; `scene_kind: lyric-art` MUST reference image-gen tool assets. Mismatch → critical (no fake news).
- [ ] Manual smoke test: 15-20s no-caption PS2 sample.

**Cross-references.** audit C-42, QD-19.

## L-17 — The ChaosFM pipeline + director skills (brand-via-metadata pattern)

**Standard acceptance.**
- [ ] Manifest is minimal (inherits news-song stages + skills as `required_skills`). PIP-2 `metadata` passthrough accepts the brand block.
- [ ] **Content-fidelity — manifest includes**:
  - `metadata.brand`: `name`, `slug`, `guide` (BRAND_GUIDE.md path), `style_playbook` (`thechaosfm-gta-political`), `logo`, `project_root`.
  - `metadata.content_modes`: `sourced-political-news-song` (`requires_sources: true`), `source-free-protest-music-video` (`requires_sources: false`).
  - `metadata.defaults`: `canvas: "1920x1080"` (landscape, not 9:16 — distinct from music-video), `caption_mode: "none"`, `source_cards: "only_when_sources_exist"`, `opening_branding` block (Pricedown, all_caps, circular logo mask, centered below opening title), `end_branding` block (circular logo mask, second-to-last scene top center, subscribe spring-bounce), `final_shot.keep_uncluttered: true`.
  - Per-stage `review_focus` overrides: ChaosFM opening treatment, logo + subscribe in second-to-last scene, sources-only flyouts, no lyric captions in compose.
  - `compatible_playbooks.recommended: [thechaosfm-gta-political]`; `also_works: [ps2-dystopian-news-rap, news-song-protest]`.
- [ ] Demonstrates single-show-multi-pipeline pattern (the starter ships as one-pipeline; multi-pipeline composition covered by L-18 shared helpers).

**Cross-references.** audit C-43.

## L-18 — L2P shared helpers (COMMON-1..4 consolidated)

**Standard acceptance.**
- [ ] **Shared shot-prompt builder** at `bundled/skills/_shared/shot-prompt-builder.md` + helper `src/prompts/shot-prompt-builder.ts`. Composes (subject, subject motion, scene, spatial framing, camera) into a coherent prompt with playbook style suffix.
- [ ] **Shared research_brief schema** (covered in F-8; re-link here).
- [ ] **Shared script schema** (covered in F-8; re-link here).
- [ ] **5-aspect video specification framework** at `bundled/skills/_shared/video-prompting.md`:
  - Verbatim 5-aspect block with all sub-attribute lists (Subject, Subject Motion, Scene, Spatial Framing, Camera).
  - Required verbatim governance rule: `"Mark any aspect explicitly as N/A if it doesn't apply (e.g., 'Subject: N/A — pure scenery shot,' or 'Scene overlays: N/A — no graphics'). Silent omission is the most common analyst failure and produces ambiguous downstream prompts."`
  - Required overlays-not-in-depth-axis callout (verbatim): `"Overlays (text, lower thirds, graphics, watermark) are their own layer. Do not merge them into the depth axis of the Scene aspect — they live above the scene, not inside it."`
- [ ] Cross-referenced from L-4 (cinematic), L-15 (music-video), L-16 (news-song), L-2 (explainer), B-2 (video-reference-analyst).
- [ ] `shot_prompt_builder` port preserves all phrase-map entries:
  - `_SHOT_SIZE_PHRASES` (10 entries).
  - `_MOVEMENT_PHRASES` (18 entries).
  - `_LIGHTING_PHRASES` (11 entries).
  - `_DOF_PHRASES` (3 entries).
  - `_COLOR_TEMP_PHRASES` (4 entries).

**Cross-references.** audit C-6, L2P-COMMON-4.

## Batch 8.G — Migration hardening

**Standard acceptance.**
- [x] Broken `skills/creative/*` references resolve through bundled creative skills or inlined prose.
- [x] Python-era registry/tool snippets in migrated skills are rewritten for predit's TypeScript harness.
- [x] Migrated manifests preserve source-required semantics: explicit EP skill, `required_tools`, `optional_tools`, artifact inputs, checkpoint flags, compatible playbooks, and extension flags.
- [x] Source-harness tool names remain first-class registry names (`scene_detect`, `tts_selector`, `image_selector`, `video_selector`, `web_search`, `hyperframes_compose`) instead of being silently rewritten away.
- [x] Daily-news preserves capture-before-script ordering via explicit `stage_order: manifest`.
- [x] `schemas/artifacts/*.schema.json` is generated from `src/artifacts/json-schema.ts`.
- [x] Porter scripts default to dry-run/force-aware clobber protection so AI second-pass edits are not overwritten accidentally.

---

# Phase C — Integration epics

# Epic 9 — Runner Integration + Reference Workflow + Compose

**Goal.** Wire Epic 2's loaders and Epic 4–7's tools into the integrated Runner. Add the reference-driven workflow that routes URL inputs through `video-reference-analyst`. Hook up the announce/escalate contract into the live execution path.

**Hard dependencies.** Epic 2 (Runtime Harness), Epic 4 (Audio Subsystem), Epic 5 (Composition tools).

**Soft dependencies.** Capability tool epics 6–7 don't block Runner integration but improve smoke-test outcomes.

## Batch 9.A — Runner integration

*Sequential.* I-1 wires the core; I-2 layers in cost + announce; I-3 wires reference workflow.

## I-1 — Runner state machine (full implementation)

**Standard acceptance.**
- [ ] `Runner.run(opts)` integrates Epic 2's loaders + stage dispatch + checkpoint utilities + Epic 3's reviewer + decision log:
  - Refreshes registry availability at start; surfaces warnings as a prefix block.
  - Loads context (show + episode + pipeline + playbook merged per resolution order).
  - Plans stages: honors `--from`, `--to`, `--only`.
  - For each stage: agent dispatch → produces artifact → reviewer pass (V-1) → checkpoint write → approval gate (CHK-5) → advance or revise (max rounds per pipeline orchestration).
  - Budget enforcement halts on cumulative cost exceeding `--budget`.
  - Per-pipeline orchestration limits honored: `max_revisions_per_stage`, `max_send_backs`, `max_wall_time_minutes`.
- [ ] Audio-led pipelines: ensures `audio_sync: build` stage completes before any `audio_sync: required` stage runs.
- [ ] Interactive mode: prompts at `human_approval: required` checkpoints.
- [ ] `--non-interactive` mode: exits with `awaiting_human` at the first required approval; `predit approve`/`predit revise` advance it.
- [ ] Pipeline with all stages `human_approval: never` runs end-to-end without prompts.
- [ ] Tests verify the framework-smoke pipeline runs to completion against fixtures.

**Cross-references.** `specs/05-pipelines.md`, `specs/12-checkpoint-protocol.md`.

## I-2 — Cost tracking + announce integration + final-review halt gate

**Standard acceptance.**
- [ ] Cost tracker (R-6) wired into Runner — every paid tool call records.
- [ ] **Pre-execution announce** (V-11): every non-zero-cost tool call emits the announce block before execution. Interactive: prompt; non-interactive: log + proceed.
- [ ] **Major-change gate**: detects provider/model/runtime/element-drop changes mid-run; refuses without explicit user approval + logged supersession.
- [ ] **Final-review halt gate** (V-9) wired into compose stage: on `final_review.status === 'fail'`, halts; preserves render at `renders/final-failed.mp4`; offers `predit approve --force` (logs `downgrade_approval`).
- [ ] **Stage-level estimated_cost aggregation**: sums across cost-incurring stages; shows projected sample + full totals at proposal-time approval block.
- [ ] **Cost-drift detection**: `cumulative_actual > 1.3 × cumulative_estimated` → critical reviewer finding (V-3 trigger).

## I-3 — Reference workflow integration

**Standard acceptance.**
- [ ] When `predit build` input includes a video URL or local file path that exists, route to `video-reference-analyst` skill BEFORE pipeline selection.
- [ ] URL detection: parsed by `new URL()`; anything else falls through to local-file resolution.
- [ ] Local file path resolution: absolute paths honored; relative resolved against cwd then `<project>/music_library/`.
- [ ] After analysis: present 5-aspect breakdown, ask the critical questions, propose 2–3 differentiated concepts.
- [ ] Hard redirect into pipeline after sample approval (no collapsing stages).
- [ ] `video_analysis_brief` artifact travels alongside standard artifacts; reviewer's reference-alignment pass (V-3) consumes it.

**Cross-references.** `specs/16-onboarding-and-discovery.md`, `bundled/skills/meta/video-reference-analyst.md`.

## Batch 9.B — Integration polish

*Parallel-safe within batch.*

## I-4 — Capability extension hookup

**Standard acceptance.**
- [ ] When the agent needs a tool/script/playbook/skill that doesn't exist, `MET-11` capability-extension protocol activates:
  - Project-scoped scripts at `projects/<show>/<episode>/scripts/` — idempotent, file-artifact-producing.
  - Custom playbooks at `playbooks/<custom-name>.yaml`, validated against PBK schema.
  - Project-scoped skills at `shows/<show>/skills/<name>.md`.
  - Project-scoped tools at `projects/<show>/<episode>/tools/<name>.ts` — must inherit Tool, must register before use, requires user approval before first paid API call.
- [ ] Every extension logged with `category: "capability_extension"` decision entry.
- [ ] User verbatim phrase: `"I wrote a custom <kind> for X because no existing tool handles Y."`
- [ ] Reviewer rejects scripts that modify existing tools (must create wrappers).

## I-5 — End-to-end smoke + sample-first hookup

**Standard acceptance.**
- [ ] Sample-first protocol (V-12 skill + reviewer trigger) wires into Runner: at proposal stage, if pipeline's sample-first trigger fires AND `sample_required: true` not in proposal, reviewer flags critical → user prompted → either sample sub-checkpoint produced (R-5) or `downgrade_approval` decision recorded.
- [ ] Framework-smoke E2E test (D-9 in Epic 10 also depends on this) runs from `predit build` to final render in < 30s on fixtures.

---

# Epic 10 — User Project + Starters + Delivery

**Goal.** User-facing CLI commands for project lifecycle, the 7 bundled starter shows, the NLE export verb, CI infrastructure, documentation, and the public-flip checklist verification.

**Hard dependencies.** Epic 9 (integrated Runner). Starters need a working build to demonstrate.

## Batch 10.A — User project lifecycle

*Parallel-safe within batch.*

## D-1 — `predit init` + `predit update` + `.predit/` cache materialization

**Standard acceptance.**
- [ ] `predit init` scaffolds in cwd: `CLAUDE.md`, `AGENTS.md`, `.gitignore`, `.predit/` cache (mirrors `bundled/`), empty `shows/`, `projects/` (gitignored), `music_library/` (gitignored). Optional `--git` runs `git init`, stages, and commits as `"Initial predit project scaffold."` Optional `--starter <name>` clones from the starter library.
- [ ] In an empty directory: produces the documented tree. In an already-initialized directory: errors clearly.
- [ ] `predit update` refreshes `.predit/` from currently-installed harness version. Writes `version.json` with `{ harness_version, bundled_checksum, locked_at }`.
- [ ] Every command (except `init` itself) compares installed harness vs `.predit/version.json` and warns on mismatch.
- [ ] On a major-version mismatch (`incompatible`): refuses to operate, prompts `predit update` or `pnpm i -g predit@<version>`.

**Cross-references.** `specs/10-installation-and-user-projects.md`.

## D-2 — `predit watch` + `predit import`

**Standard acceptance.**
- [ ] `predit watch` reads each show's `ingest.watch[]` config from `show.yaml`; watches declared paths. On match, prints suggested `predit import` command. Triggers within 2s of a drop.
- [ ] `predit import <path> --as <show>/<episode>` uses the show's ingest config to detect pipeline + slug + inputs. Creates `shows/<show>/episodes/<slug>.yaml`. Refuses to overwrite.
- [ ] Imports a fixture folder into a new episode.

## D-3 — Project-root detection in every command + `predit.lock` (post-v0.1.0)

**Standard acceptance.**
- [ ] Every command except `init` requires a project root (per F-5). Produces useful error pointing to `predit init` when missing.
- [ ] **`predit.lock`** marked **post-v0.1.0** in spec 10. When implemented:
  - `predit init` writes `predit.lock` with harness version + bundled checksum.
  - `predit update` errors on mismatch unless `--force`.
  - `predit update --check` non-mutating; exits non-zero on mismatch.
- [ ] In v0.1.0, this issue ships the project-root detection only; `predit.lock` is tracked but not implemented.

## Batch 10.B — Starter shows

*Parallel-safe within batch.* Each starter ships a working zero-key smoke.

## D-4 — Audio-led starters (music-video + news-song + thechaosfm + cinematic-trailer)

**Standard acceptance.**
- [ ] Each starter at `bundled/starters/<name>/` contains: `show.yaml` with valid `pipelines:` map, `brand/` stub, `characters/_template/`, `episode.template.yaml`, `episodes/sample-episode.yaml` (pre-filled with fixture media), `inputs/sample-episode/` (synthesized track + lyrics fixture for music-video / news-song; sample image for cinematic-trailer), `README.md`.
- [ ] **`predit build <show>/sample-episode --sample` succeeds end-to-end with zero API keys.** Uses Piper TTS (local) + Pixabay/Pexels free + ffmpeg + Remotion if available. Produces a 15-second sample.
- [ ] `predit ls starters` documents each with name, description, pipelines, fixture size, expected sample duration.

## D-5 — Visual/explainer starters (animated-explainer + documentary + product-demo)

**Standard acceptance.**
- [ ] Same shape as D-4: starter dir with show.yaml + brand + character template + episode template + sample-episode + fixture inputs + README.
- [ ] Zero-key smoke succeeds.

## D-6 — Specialty starters (ww2-diary + ai-workflow-demo)

**Standard acceptance.**
- [ ] Same shape; zero-key smoke succeeds.
- [ ] ai-workflow-demo demonstrates `screen-demo` pipeline with `synthetic_terminal` mode (no real screen capture needed).

## Batch 10.C — NLE Export

*Parallel-safe within batch.*

## D-7 — Export base + Premiere XML + DaVinci XML

**Standard acceptance.**
- [ ] `predit export <show>/<episode> --target <target>` reads `edit_decisions`, `cuesheet`, `asset_manifest`, `render_report` from the project workspace. Aborts with useful error when artifacts missing.
- [ ] **Asset linkage modes**: `copy` (default), `symlink`, `reference`. All three produce a working export package per `specs/09-export.md`.
- [ ] **Premiere XML exporter** — writes FCP7 XML; output imports cleanly into Premiere with cuts + audio intact (manual).
- [ ] **DaVinci XML exporter** — writes FCP7 XML (same base format); imports cleanly into Resolve (manual).
- [ ] **Publish log artifact** at `projects/<show>/<episode>/publish_log.json` — records what was exported, when, where. Schema at `bundled/schemas/artifacts/publish_log.schema.json`.

## D-8 — CapCut draft + EDL exporters

**Standard acceptance.**
- [ ] **CapCut draft exporter** — writes CapCut JSON draft format. Imports into CapCut (mobile or desktop) with cuts + captions + assets (manual).
- [ ] **EDL exporter (CMX 3600)** — output is a valid CMX 3600 EDL. Lowest common denominator; works in every NLE.

## Batch 10.D — CI + Docs + public flip

*Parallel-safe within batch.*

## D-9 — CI workflow + linting + smoke + coverage drift

**Standard acceptance.**
- [ ] `.github/workflows/ci.yml` runs `pnpm install`, `pnpm typecheck`, `pnpm test`, plus the framework-smoke E2E pipeline.
- [ ] **Smoke pipeline E2E** in CI: framework-smoke (L-1) runs against fixtures and produces a `render_report` in < 30s with zero API keys.
- [ ] Schema validation gate: every Zod schema round-trips against fixtures; CI fails when a schema changes without updating fixtures.
- [ ] ESLint + Prettier configured; `pnpm lint` passes; pre-commit hook (husky) blocks unformatted commits.
- [ ] **Coverage drift CI gate** (`scripts/audit-coverage-drift.ts`): when `.migration/` exists locally, compares the audit map against `IMPLEMENTATION.md` issue references + walks the reference repo for new files. PR comment on drift. Gracefully no-ops post-public-flip when `.migration/` is removed.
- [ ] **L3V inventory re-walk CI gate** (`scripts/audit-l3v-drift.ts`): runs nightly; reports new sibling Layer 3 skills not present in `bundled/skills/agents/`. PR comment on new items.

**Cross-references.** audit S-3, S-30, L3V-76.

## D-10 — Documentation

**Sub-checklist.**
- [ ] **Public README polish** — quickstart + feature list + installation. Replaces placeholder.
- [ ] **Quickstart guide** at `docs/quickstart.md` — walks new user from `pnpm add -g predit` to first rendered music-video sample. Reproducible on fresh machine with at least one image + one TTS provider configured.
- [ ] **Contributing guide** at `CONTRIBUTING.md` — how to author a new pipeline, new tool, new skill. References AGENTS.md (harness contributor contract).
- [ ] **Provider catalog doc** at `docs/providers.md` — generated from registry. `pnpm run docs:providers` regenerates. Deterministic output (sort by capability → provider → name). CI diff empty when no tool definition changed.
- [ ] **Shows roadmap template** at `bundled/templates/user-project/docs/ROADMAP.md` — three-layer mental model + show-type-per-row planning convention users can adopt.
- [ ] **CHANGELOG** with v0.1.0 entry.

## D-11 — Public-flip checklist verification

**Standard acceptance.**
- [ ] Final smoke test executes `specs/01-repo-and-licensing.md` public-flip checklist on a fresh clone of the repo:
  - `.migration/` removed from working tree.
  - `git grep` for sibling-repo path names returns no hits.
  - `LICENSE` Apache 2.0 present.
  - `README.md` complete.
  - In-repo runnable example: `predit init --starter <name> && predit build <show>/sample-episode --sample` succeeds end-to-end with zero API keys.
  - `predit watch` and `predit import` work against fixture drop folder.
  - `pnpm install && pnpm build && pnpm test` green.
  - CHANGELOG entry for v0.1.0.
  - All open pre-release-tagged issues closed or moved to post-release.

---

# Phase D — Demo readiness

# Epic 11 — Demo Readiness + Provider Validation

**Goal.** Make `predit` demo-ready as a CLI-first harness. A reviewer should be able to create a separate user project, configure OpenAI + ElevenLabs + Higgsfield, and render one representative sample for every approved bundled pipeline/starter lane while preserving the separation between the installed harness and user-owned show content.

**Who benefits.** Brad and reviewers get a repeatable demo matrix that proves the production guts work outside the harness repo. Future users get a clearer mental model: install the CLI, initialize a user project, let the coding agent run production from that project.

**Current baseline after PR #200.** Baseline bundled pipeline manifests are filled in and schema-tested. The nested compose-stage `final_review` regression is fixed in PR #200 commit `98fca8a`, and the zero-key `music-video` sample now produces V-9-compliant final review artifacts. Demo readiness is not complete yet: only `music-video` currently renders through `--sample` end-to-end, and several starters still need normalization, refusal, or sample-support metadata before the demo matrix can be trusted.

**Impact.** This epic turns production readiness into observable evidence: pipeline taxonomy, starter correctness, provider preflight, paid-provider sample runs, export handoff, and comparison reports.

**Hard dependencies.** Epic 10 (project lifecycle + starters + export), Epic 6 (video/audio generation tools), Epic 7 (analysis/specialty tools).

**Status when complete.** `predit` ships an approved, documented bundled pipeline surface, show starters are no longer confused with pipeline types, every advertised starter either builds a sample or refuses early with a clear starter-aware message, paid provider preflight is clear, and a demo operator can run the matrix from a clean user project without entering the harness repo.

## Batch 11.A — Pipeline taxonomy + starter correctness

*Sequential.* DR-1 establishes the taxonomy guard; DR-2 audits the shipped manifests; DR-3 fixes starter bindings; DR-4 layers show starters on top.

## DR-1 — Bundled pipeline inventory and taxonomy guard

**Standard acceptance.**
- [ ] Add a canonical demo-readiness inventory that classifies slugs as `core_default`, `seeded_extension`, `test_only`, or `show_starter_only`.
- [ ] The shipped bundled manifest inventory is explicit and tested: `animated-explainer`, `animation`, `avatar-spokesperson`, `character-animation`, `cinematic`, `clip-factory`, `daily-news`, `documentary-montage`, `hybrid`, `localization-dub`, `music-video`, `news-song`, `podcast-repurpose`, `screen-demo`, `talking-head`.
- [ ] `framework-smoke` is explicitly `test_only` and never appears as a default starter.
- [ ] A test fails if a default starter references a missing bundled pipeline.
- [ ] A test fails if a show-only concept such as `ww2-diary`, `thechaosfm`, `last-rev`, `rave-queen`, `gta-political`, or `aint-no-crowns` is added as a bundled pipeline type.
- [ ] The taxonomy test is wired into the bundled pipeline/starter test suite so future agent runs cannot silently regress it.

**Cross-references.** `specs/05-pipelines.md`, `specs/10-installation-and-user-projects.md`, `docs/demo-readiness.md`.

## DR-2 — Audit shipped pipeline manifests and director skills

PR #200 filled in the baseline bundled manifests. This issue is now a cleanup/audit pass to make sure the shipped manifests, director skills, fixtures, and CLI listing behavior are production-ready.

**Standard acceptance.**
- [ ] Every bundled manifest validates with `PipelineManifestSchema`.
- [ ] Every bundled stage resolves its required director skill from a freshly initialized user project.
- [ ] Every pipeline skill set includes the required fixture/audit strings expected by the test suite.
- [ ] Each stage has clear `required_artifacts_in`, `produces`, `review_focus`, `success_criteria`, `estimated_cost`, and `human_approval` semantics.
- [ ] Stage directors are predit-native Markdown and do not refer to sibling-repo paths, private migration folders, or harness-private project folders.
- [ ] `predit ls pipelines --json` lists the approved bundled pipeline inventory from a freshly initialized user project.

**Cross-references.** `specs/05-pipelines.md`, `specs/08-skills.md`, DR-1.

## DR-3 — Normalize or refuse default starter pipeline slugs

Known cleanup targets:
- `documentary` currently points at missing pipeline `documentary`; decide whether it should use `documentary-montage` or be removed/refused until redesigned.
- `product-demo` currently points at missing pipeline `product-demo`; decide whether it should use `screen-demo`, `hybrid`, or be removed/refused until redesigned.
- `ww2-diary` currently points at missing pipeline `ww2-diary`; keep it as a show starter on a real pipeline, likely `cinematic`, or refuse/remove until that decision is implemented.
- `ai-workflow-demo`, `animated-explainer`, and `cinematic-trailer` still list `pending_pipelines` entries even though their target manifests now ship.

**Standard acceptance.**
- [ ] All default bundled starters reference existing bundled pipeline slugs.
- [ ] Broken starters are either fixed, removed from the bundled default set, or refused at `predit init --starter` with a clear message naming the missing/undecided pipeline binding.
- [ ] Remove `pending_pipelines` as an acceptable escape hatch for default bundled starters.
- [ ] Clear stale `pending_pipelines` entries for `ai-workflow-demo`, `animated-explainer`, and `cinematic-trailer`.
- [ ] Starter README files distinguish starter name from pipeline slug.
- [ ] `predit ls starters --json` reports real pipeline keys and sample support status for every bundled starter.

**Cross-references.** `specs/04-shows-and-episodes.md`, `specs/10-installation-and-user-projects.md`, DR-1.

## DR-4 — Recast show concepts as show/playbook starters

**Standard acceptance.**
- [ ] `ww2-diary` is a show starter that uses `cinematic`, not a pipeline.
- [ ] `thechaosfm` is a branded show starter that uses `news-song` or `music-video` plus `thechaosfm-gta-political`, not a default pipeline type.
- [ ] Last Rev workflows are demo/show starters on `animated-explainer` or `screen-demo`, not new pipeline types.
- [ ] Rave Queen is a demo/show starter on `cinematic` or `animation`, with the decision recorded in the starter README.
- [ ] TheChaosFM/Ain't No Crowns benchmark metadata is documented as a show-level reference: 16:9, no captions, source-free, OpenAI image generation, Higgsfield/Kling clips, HyperFrames target.
- [ ] The taxonomy guard from DR-1 fails if these show-only slugs appear under `bundled/pipelines/`.

**Cross-references.** `specs/04-shows-and-episodes.md`, `docs/demo-readiness.md`.

## Batch 11.B — Provider-backed production lane

*Parallel-safe after DR-1.* These issues make OpenAI + ElevenLabs + Higgsfield a coherent first paid-provider profile.

## DR-5 — Paid demo provider profile and preflight

**Standard acceptance.**
- [ ] Add a documented provider profile named `paid-demo` for OpenAI image/TTS, ElevenLabs TTS, Higgsfield image-to-video, and ffmpeg local assembly.
- [ ] Replace the `doctor` stub with a real preflight command.
- [ ] `predit doctor` clearly reports availability for `OPENAI_API_KEY`, `ELEVENLABS_API_KEY`, `higgsfield` binary, `higgsfield whoami`, `ffmpeg`, and `ffprobe`.
- [ ] Missing credentials produce setup instructions, not stack traces.
- [ ] Provider profile selection is recorded in `decision_log` with rejected alternatives.
- [ ] Paid-provider sample runs emit announce blocks before every non-zero-cost generation call.

**Cross-references.** `specs/06-tool-registry.md`, `specs/15-announce-and-escalate.md`, `docs/providers.md`.

## DR-6 — Tool compatibility aliases and availability fixes

**Standard acceptance.**
- [ ] Add compatibility aliases or manifest rewrites for legacy tool names: `higgsfield_video`, `direct_clip_search`, `remotion_caption_burn`, `character_spec_generator`, `pose_library_builder`, `svg_rig_builder`, `character_rig_renderer`, `character_animation_reviewer`, `action_timeline_compiler`.
- [ ] `node:*` and global-runtime integrations such as `node:fetch` do not fail `require.resolve` based availability checks.
- [ ] Registry tests cover alias lookup, capability lookup, and unavailable-provider messaging.
- [ ] No bundled manifest references an unregistered tool name after alias resolution.
- [ ] Tool `agent_skills` references resolve to bundled skills or are intentionally removed. Known gaps include OpenAI image guidance, Recraft image guidance, stock image/video guidance, and attribution guidance.

**Cross-references.** `specs/06-tool-registry.md`.

## DR-7 — Paid and sample mode through Runner

Current baseline:
- `music-video` has a working zero-key `--sample` path.
- `news-song`, `thechaosfm`, `animated-explainer`, `cinematic-trailer`, and `ai-workflow-demo` currently fall through to external-agent stages and fail cleanly under `</dev/null` with no render.
- `documentary`, `product-demo`, and `ww2-diary` currently fail at pipeline load until DR-3 normalizes or refuses them.

**Standard acceptance.**
- [ ] `predit build <show>/<episode> --sample` can opt into paid providers through documented show/episode/provider config without bypassing the Runner.
- [ ] Every advertised bundled demo starter either produces a sample render or reports `sample_support: unsupported` with a useful CLI message.
- [ ] Sample mode limits duration, scene count, and cost for each pipeline family.
- [ ] OpenAI image generation writes asset files and cost entries.
- [ ] ElevenLabs TTS writes narration/audio files and cost entries.
- [ ] Higgsfield CLI image-to-video writes clip files, caches repeated prompts/inputs, and cost entries.
- [ ] A failed paid-provider call leaves the stage checkpoint inspectable and resumable.
- [ ] The nested `final_review` regression test added in PR #200 remains green so sample renders are actually reviewed.

**Cross-references.** `specs/12-checkpoint-protocol.md`, `specs/14-decision-log.md`, DR-3.

## Batch 11.C — Demo matrix + verification

*Parallel-safe after DR-2 and DR-3.* These issues prove each pipeline type can produce something inspectable.

## DR-8 — Demo briefs for every approved demo lane

**Standard acceptance.**
- [ ] Add one sample brief/input folder for each approved demo lane from DR-1 and DR-3.
- [ ] Demo briefs use fresh content while preserving each format's structure.
- [ ] Each brief declares expected aspect ratio, duration target, provider profile, runtime, master clock, and export target.
- [ ] Audio-led demos include a real or synthetic track/lyrics fixture; narration-led demos include script or narration inputs; screen demos include synthetic terminal or screenshot fixtures.
- [ ] Demo fixture licensing is documented; no private generated media is committed unless explicitly approved.

**Cross-references.** `specs/04-shows-and-episodes.md`, `specs/10-installation-and-user-projects.md`.

## DR-9 — CLI demo matrix runner

**Standard acceptance.**
- [ ] Add a harness-maintainer script that creates a fresh user project outside the repo, runs the installed or local `predit` CLI, initializes each starter/show, and runs `build --sample`.
- [ ] The runner accepts `--zero-key`, `--paid-demo`, `--only <slug>`, `--keep-workdir`, and `--json`.
- [ ] The runner never writes generated demo outputs into the harness repo.
- [ ] The runner records the exact CLI path/version, provider profile, env availability, and working directory for each run.
- [ ] Failures are summarized per pipeline with the failed command, exit code, last event, and artifact paths.

**Cross-references.** `specs/03-cli.md`, `specs/10-installation-and-user-projects.md`.

## DR-10 — Render artifact verification and export checks

**Standard acceptance.**
- [ ] Every demo run verifies `render_report`, `asset_manifest`, `edit_decisions`, `cost_log`, and `decision_log` where the pipeline is expected to produce them.
- [ ] `ffprobe` validates rendered duration, resolution, frame rate, and audio presence according to each demo brief.
- [ ] The runner exports Premiere XML and EDL for every completed sample.
- [ ] A contact sheet or frame sample summary is generated for visual review.
- [ ] Verification results are written as a single JSON report that can be attached to a PR or issue.

**Cross-references.** `specs/09-export.md`, `specs/17-self-review-of-output.md`.

## Batch 11.D — Comparison + operator docs

*Parallel-safe after DR-9.* These issues make the demo useful for review rather than just green/red CI.

## DR-11 — Baseline comparison report

**Standard acceptance.**
- [ ] Add a comparison report template for running equivalent inputs through the reference baseline and `predit`.
- [ ] The report captures pipeline slug, provider choices, stage artifacts, render duration, cost, runtime, export outputs, and reviewer findings.
- [ ] Differences are categorized as migration bug, intentional CLI-model difference, provider drift, or creative variance.
- [ ] The Ain't No Crowns reference is documented as a TheChaosFM show benchmark, not a default pipeline benchmark.
- [ ] The report can be filled from the demo matrix JSON plus manual notes from baseline runs.

**Cross-references.** `docs/demo-readiness.md`.

## DR-12 — CLI operator guide for agents and reviewers

**Standard acceptance.**
- [ ] `docs/demo-readiness.md` explains the legacy in-repo run model versus the `predit` CLI/user-project model without requiring operators to work inside the harness repo.
- [ ] The guide includes verified commands for local development without publishing: build the harness, run `dist/cli/index.js` from a separate folder, initialize a starter, build a sample, and export it.
- [ ] The guide includes provider setup for OpenAI, ElevenLabs, and Higgsfield without storing credentials in the repo.
- [ ] The guide states current expected green paths and known blockers for the full demo matrix.
- [ ] The user-project `AGENTS.md` template points agents toward this model without encouraging edits inside `.predit/`.

**Cross-references.** `specs/10-installation-and-user-projects.md`, `bundled/templates/user-project/AGENTS.md`.

---

# Out of scope for v0.1.0 (future epics)

These appear in the coverage audit but are deferred:

- Publishing automation (YouTube, social schedule).
- Cloud-distributed render farm.
- Web UI for project management.
- Plugin system for community-contributed pipelines.
- LSP integration for editing `show.yaml` / `episode.yaml` with auto-complete.

**Deferred from audit findings:**

- **D-3** `predit.lock` is scaffolded but not enforced in v0.1.0. Multi-collaborator workflow relies on documented `pnpm i -g predit@<version>` until the lock is implemented.
- **F-13** full provider-scoring formula — v0.1.0 uses preference + availability + discovery order. Documented divergence with known consequences. Revisit in v0.2 if real production drift surfaces.
- **`predit revise --decision <id> --pick <option>`** — v0.1.0 supports note-based revise only; by-decision workflow lands in v0.2.
- **CODEX.md / COPILOT.md / CURSOR.md** — `AGENTS.md` is the broadly-supported convention (Cursor, Codex, Claude Code all read it via the CLAUDE.md pointer). No tool-specific files planned.
- **`edit_decisions` legacy field migration from existing sibling-repo projects** — handled at the schema level (F-9 supports both legacy and modern fields with `migrateEditDecisions`), but a hand-port from existing projects is not in scope. Fresh start in predit's user-project model.

---

# Glossary

| Term | Definition |
|---|---|
| Harness | The `predit` CLI + bundled content. |
| User project | The user-owned folder where `predit init` was run. |
| Show | A brand / channel / identity — `shows/<show>/show.yaml`. Declares a map of pipelines. |
| Episode | A single rendered output — `shows/<show>/episodes/<slug>.yaml`. Picks one of the show's pipelines. |
| Pipeline | A workflow (stages + tools + approval gates + audio-sync policy). |
| Playbook | A look (palette, typography, motion, audio mood). |
| Director skill | Markdown skill teaching the agent how to execute a pipeline stage. |
| Meta skill | Cross-cutting agent protocol (reviewer, checkpoint, decision-log, etc.). |
| Layer 3 skill | Vendor-specific prompt engineering / parameter knowledge. |
| Master clock | Whether audio, voiceover, or action_timeline drives scene timing. |
| Cuesheet | Canonical audio-subsystem artifact (segments, sections, beats, climax, anchors). |
| Bundled | Content shipped with the harness, mirrored into the user project's `.predit/` cache. |
| Epic | A parent issue with a checklist of child issues; alpha-loop's scheduling unit. |
| Batch | A group of child issues within an epic with no inter-dependencies; can be picked up by parallel alpha-loops on the same epic. |
