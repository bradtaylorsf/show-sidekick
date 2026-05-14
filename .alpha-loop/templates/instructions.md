<!-- managed by alpha-loop -->
# predit

## Overview
predit is a show-first AI pre-production harness for video: a CLI plus instruction layer that lets agents run episode pipelines, align visuals to audio, voiceover, or action-timeline clocks, and produce rough cuts with NLE handoff packages. This repo is the harness source for contributors, not a scaffolded user project; user projects own shows, characters, brand assets, generated media, and runtime state.

The current source includes the CLI surface, config/schema loaders, tool registry, bundled content, checkpoints, decisions, review/cost/approval support, audio/media utilities, and compose/runtime adapters. Some CLI verbs remain stubs while runner/export integration continues, so check the implementation before assuming a spec command is live end-to-end.

## Tech Stack
- Language: TypeScript 5.5, strict mode, ESM, NodeNext, ES2022 target
- Runtime: Node.js 22+
- CLI: Commander 12; no web framework
- Package manager: pnpm 9
- Build output: `tsc` to `dist/`; source lives in `src/`
- Key runtime dependencies: commander, zod, yaml, picocolors
- Tool integrations model optional providers through the registry; do not promote provider SDKs to runtime dependencies unless the harness itself needs them.

## Directory Structure
- `specs/`: Locked design contract; read the relevant spec before touching code or bundled content.
- `src/`: TypeScript implementation root. Major areas include `cli/`, `config/`, `paths/`, `shows/`, `pipelines/`, `playbooks/`, `skills/`, `artifacts/`, `registry/`, `tools/`, `tool-support/`, `harness/`, `checkpoints/`, `decisions/`, `cost/`, `review/`, `announce/`, `audio/`, `media/`, `compose/`, `remotion/`, `hosting/`, and `log/`.
- `bundled/`: Shipped harness content copied or cached into user projects: `pipelines/`, `playbooks/`, `skills/`, generated `schemas/`, `templates/`, decision-log requirements, sample-first triggers, fixtures, and notes.
- `bundled/templates/user-project/`: Files written by `predit init`; keep this separate from the root harness contributor contract.
- `scripts/`: Maintenance utilities for porting bundled content and generating bundled artifact schemas.
- `dist/`: Generated build output; do not edit by hand.
- `.alpha-loop/`: Alpha Loop automation context and source templates. Agent/skill source-of-truth files live under `.alpha-loop/templates/`; synced `.claude/`, `.codex/`, and `.agents/` copies should not be hand-edited unless debugging sync output.

## Code Style
Use ESM-compatible TypeScript with NodeNext resolution; relative imports that emit to JS must include the `.js` extension. Keep one feature per `src/` directory, allow barrel `index.ts` files only when they expose a clean public surface, and use comments only to explain non-obvious why.

Use Zod for every external contract: YAML configs, pipeline manifests, tool inputs/outputs, artifacts, checkpoints, state, cost logs, and decision logs. Load YAML/JSON through shared parsing utilities in `src/config/`, not ad-hoc string handling.

Keep the architecture layered: shipped workflow belongs in `bundled/pipelines/*.yaml`, stage procedure belongs in Markdown director skills, cross-cutting production guidance belongs in meta/core skills, provider prompting belongs in `bundled/skills/agents/`, concrete integrations belong in `src/tools/`, selection belongs in the registry, and orchestration belongs in the harness.

User project resolution is contractual: project-local resources override `.predit/` cache resources. Director skills resolve show-specific first, then project-local, then bundled pipeline, then bundled shared.

Use path-safe lowercase slugs when authoring shows, pipelines, playbooks, characters, and episodes. Use exact snake_case enum values for canonical stages, artifacts, capabilities, render runtimes, decision categories, and generated schema filenames. Director skill files follow `<stage>-director.md`.

Config merge semantics are contractual: objects merge by key, arrays replace, and `null` removes a key. Prefer structured errors with file path and actionable validation details over raw stack traces or raw Zod dumps.

Concrete tool modules export one registry-shaped default, normally through `defineTool`. Tool execution context carries project root, logger, registry, command runner, cost/approval policy, major-change checks, and motion guardrails; preserve those wrappers.

## Non-Negotiables
Specs are the contract. If code and specs disagree, surface it; when behavior changes, update the relevant spec with the implementation.

Do not break consumer-facing shapes casually: `show.yaml`, `episode.yaml`, pipeline manifests, tool registry contracts, artifact schemas, checkpoints, state files, cost logs, and decision logs require migration handling for breaking changes.

Do not implement a new pipeline as orchestration code unless the specs prove it cannot be expressed as a manifest plus director skills. New code is for schemas, registry/tool behavior, filesystem/state logic, review primitives, media/audio primitives, and reusable runtime support.

All tool execution goes through the registry and `defineTool`-style wrappers. Do not add ad-hoc scripts or direct provider calls that bypass tool availability, cost tracking, auth modeling, announce/approval behavior, or Layer 3 vendor skills.

Tools that write generated artifacts must keep output paths inside the user project root. User-supplied source media may be read from absolute paths, but review artifacts should preserve the caller's original path string.

predit must not store credentials. CLI tools own CLI auth, API tools use environment variables, and setup behavior comes from each tool's `integration.install`.

Preserve the harness/user-project boundary. This repo ships the CLI, bundled content, schemas, and templates; user-owned shows, runtime state, generated media, music libraries, and export packages live in user projects.

Checkpoint, review, approval, cost, announce/escalation, sample-first, source-media review, motion guardrails, and decision-log behavior are core product guarantees. Runtime code must not skip stage checkpoints, human approval gates, cost snapshots, reviewer findings, required skill reads, or material decision entries.
