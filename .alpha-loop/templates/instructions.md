<!-- managed by alpha-loop -->
# predit

## Overview
predit is a show-first AI pre-production harness for video: a CLI plus instruction layer that lets agents run episode pipelines, align visuals to audio, voiceover, or action-timeline clocks, and produce rough cuts with NLE handoff packages for Premiere, DaVinci, CapCut, or EDL. This repo is the harness source for contributors, not a scaffolded user project; user projects own shows, characters, brand assets, generated media, exports, credentials, and runtime state.

On first contact, read `specs/README.md`, then `specs/00-overview.md`, `specs/10-installation-and-user-projects.md`, `specs/11-agent-driven-production.md`, and the spec covering the area you are changing. If a local `.migration/` bridge exists and the task touches an area covered there, consult its concepts before designing, but treat it as private reference material only.

The current source includes project scaffolding/cache refresh, env loading, user-project skill mirrors, show/episode/pipeline/playbook scaffolding, build/resume/status/approve/revise flows, provider profile preflight, setup aliases, reference-driven builds, cuesheets, ingest/watch, export packages, config/schema loaders, provider profiles, registry/tool selection, bundled content, checkpoints, decisions, review/cost/approval behavior, audio/media utilities, Remotion-style scene primitives, compose/runtime adapters, and versioned bundled-cache support. `predit show` and top-level `predit tools <name>` still use stub handlers; use `predit ls tools` and `predit doctor` for live tool inspection.

This repo is initialized for Alpha Loop. `.alpha-loop.yaml` is the loop config, GitHub issues are the source of truth for epic/task execution, and the default role split is Claude plans/reviews while Codex implements, fixes, and validates when live verification is needed.

## Tech Stack
- Language: TypeScript 5.5, strict mode, ESM, NodeNext, ES2022 target, `react-jsx` for TSX scene primitives.
- Runtime: Node.js 22+.
- CLI: Commander 12; no web framework and no bundler for the Node CLI.
- Package manager: pnpm 9.
- Build output: `tsc` emits declarations, source maps, and JS to `dist/`; source lives in `src/`.
- Key runtime dependencies: commander, zod, yaml, picocolors.
- Dev utilities use `tsx`, Node scripts, TypeScript, and Vitest.
- Remotion, the Remotion CLI stack, React, aligned Zod, and HyperFrames are installed into scaffolded user projects when runtime setup is enabled; they are not core harness runtime dependencies.
- Provider SDKs should stay optional unless the harness itself requires them. Tool integrations model optional providers through registry capability/provider contracts, env vars, CLIs, binaries, or libraries instead of direct coupling.

## Directory Structure
- `specs/`: Locked design contract; read the relevant spec before touching code or bundled content.
- `src/`: TypeScript implementation root. Major areas include `cli/`, `config/`, `paths/`, `shows/`, `pipelines/`, `playbooks/`, `skills/`, `artifacts/`, `registry/`, `tools/`, `tool-support/`, `harness/`, `checkpoints/`, `decisions/`, `cost/`, `review/`, `announce/`, `audio/`, `media/`, `compose/`, `remotion/`, `export/`, `hosting/`, `prompts/`, `providers/`, `version/`, and `log/`.
- `bundled/`: Shipped harness content. `.predit/` cache writes only `pipelines/`, `playbooks/`, `skills/`, `schemas/`, and `starters/`; `templates/` powers `predit init`; fixtures, notes, provider profiles, decision-log requirements, and sample-first triggers support bundled behavior and docs.
- `bundled/skills/`: Pipeline director skills, shared directors, meta/core/creative guidance, and Layer 3 agent/vendor skills. Agent-native skill folders are materialized into user-project `.agents/skills/` and `.claude/skills/`.
- `bundled/templates/user-project/`: Files written by `predit init`; keep this separate from the root harness contributor contract.
- `docs/`: User-facing quickstart, demo readiness, benchmark notes, and generated provider/profile documentation.
- `scripts/`: Maintenance utilities for bundled content, artifact schemas, provider docs, lint/format helpers, drift audits, demo matrix, release readiness, and PR comments.
- `tests/`: Cross-cutting smoke, starter, schema, release, port-script, and content-fidelity coverage outside colocated `src/**/*.test.ts` files.
- `dist/`: Generated build output; do not edit by hand.
- `.alpha-loop/`: Alpha Loop automation context and source templates. Agent/skill source-of-truth files live under `.alpha-loop/templates/`; synced `.claude/`, `.codex/`, and `.agents/` copies should not be hand-edited unless debugging sync output.
- `.migration/`: Private, gitignored reference bridge when present. Do not create, edit, copy from, or leak references to it unless the user explicitly asks.

## Code Style
Use ESM-compatible TypeScript with NodeNext resolution; relative imports that emit to JS must include the `.js` extension. Keep one feature per `src/` directory, allow barrel `index.ts` files only when they expose a clean public surface, and use comments only to explain non-obvious why.

Use Zod for every external contract: YAML configs, pipeline manifests, tool inputs/outputs, artifacts, checkpoints, state, cost logs, decision logs, publish logs, and generated schema sources. Load YAML/JSON through shared parsing utilities in `src/config/`, not ad-hoc string handling.

Keep the architecture layered: shipped workflow belongs in `bundled/pipelines/*.yaml`, stage procedure belongs in Markdown director skills, reusable production guidance belongs in bundled core/meta/creative skills, provider prompting belongs in `bundled/skills/agents/`, concrete integrations belong in `src/tools/`, provider setup lanes belong in `src/providers/`, selection belongs in the registry, and orchestration belongs in the harness.

User project resolution is contractual: project-local resources override `.predit/` cache resources. Director skills resolve show-specific first, then project-local, then bundled pipeline, then bundled shared; meta and agent skills resolve show/project before bundled. Manifest `skill:` paths are authoritative, and the current resolver preserves the `animated-explainer` to `explainer` pipeline-skill directory alias.

Use path-safe lowercase slugs when authoring shows, pipelines, playbooks, characters, and episodes. Use exact snake_case enum values for canonical stages, artifacts, capabilities, master clocks, decision categories, renderer/runtime values, and generated schema filenames. Director skill files follow `<stage>-director.md`.

Config merge semantics are contractual: objects merge by key, arrays replace, and `null` removes a key. Prefer structured errors with file path and actionable validation details over raw stack traces or raw Zod dumps.

Concrete tool modules export one registry-shaped default, normally through `defineTool`. Tool execution context carries project root, logger, registry, command runner, cost/approval policy, major-change checks, motion guardrails, and first-paid-call hooks; preserve those wrappers. Project-scoped tools live under `projects/<show>/<episode>/tools/`, are tagged as project tools by the registry, and paid project API tools require first-call approval.

## Non-Negotiables
Specs are the contract. If code and specs disagree, surface it; when behavior changes, update the relevant spec with the implementation.

Do not break consumer-facing shapes casually: `show.yaml`, `episode.yaml`, pipeline manifests, tool registry contracts, artifact schemas, checkpoints, state files, cost logs, decision logs, publish logs, provider-profile decisions, and export package shapes require migration handling for breaking changes.

Do not implement a new pipeline as orchestration code unless the specs prove it cannot be expressed as a manifest plus director skills. New code is for schemas, registry/tool behavior, provider profiles, filesystem/state logic, review primitives, media/audio primitives, export primitives, and reusable runtime support.

All tool execution goes through the registry and `defineTool`-style wrappers. Do not add ad-hoc scripts or direct provider calls that bypass tool availability, cost tracking, auth modeling, announce/approval behavior, first paid-call approval, motion guardrails, or Layer 3 vendor skills.

Tools that write generated artifacts must keep output paths inside the user project root. User-supplied source media may be read from absolute paths, but review artifacts should preserve the caller's original path string.

predit must not store credentials. CLI tools own CLI auth, API tools use environment variables, and setup behavior comes from each tool's `integration.install`.

Preserve the harness/user-project boundary. This repo ships the CLI, bundled content, schemas, templates, starters, and generated provider documentation; user-owned shows, runtime state, generated media, music libraries, and export packages live in user projects.

Checkpoint, review, approval, cost, announce/escalation, sample-first, source-media review, reference analysis, provider-profile selection, runtime selection, motion guardrails, final-review gating, required skill reads, and decision-log behavior are core product guarantees. Runtime code must not skip stage checkpoints, human approval gates, cost snapshots, reviewer findings, or material decision entries.
