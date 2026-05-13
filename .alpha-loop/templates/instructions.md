<!-- managed by alpha-loop -->
# predit

## Overview
predit is a show-first AI pre-production harness for video: a CLI plus instruction layer that lets agents run episode pipelines, align visuals to audio or voiceover clocks, and produce rough cuts with NLE handoff packages. This repo is the harness source for contributors, not a scaffolded user project; user projects own shows, characters, brand assets, generated media, and runtime state.

## Tech Stack
- Language: TypeScript 5.5 (strict mode, ESM, NodeNext)
- Runtime: Node.js 22+
- Framework: Commander 12 CLI with a thin harness runner; no web framework
- Package manager: pnpm 9
- Key dependencies: commander, zod, yaml, picocolors

## Directory Structure
- `specs/`: Locked design contract; read the relevant spec before touching code or bundled content.
- `src/`: TypeScript implementation root; planned feature directories include `cli/`, `harness/`, `registry/`, `tools/`, `audio/`, `shows/`, `checkpoints/`, `decisions/`, and `remotion/`.
- `pipelines/`: Declarative bundled workflow manifests, cached into user projects as `.predit/pipelines/`.
- `playbooks/`: Reusable style/look definitions layered under show and episode overrides.
- `skills/`: Markdown operational instructions for stage directors, meta protocols, and vendor-specific Layer 3 guidance.
- `schemas/`: Zod/JSON-schema contracts for configs, manifests, artifacts, checkpoints, and decision logs.
- `bundled/templates/user-project/`: Files written by `predit init`; keep this separate from the root harness contributor contract.
- `.alpha-loop/`: Alpha-loop automation context and agent/skill templates; not part of the shipped runtime.

## Code Style
Use ESM-compatible TypeScript with NodeNext resolution; relative imports that emit to JS should be compatible with Node ESM. Keep one feature per `src/` directory, allow barrel `index.ts` files only when they expose a clean public surface, and use comments only to explain non-obvious why.

Use Zod for every external contract: YAML configs, pipeline manifests, tool inputs/outputs, artifacts, checkpoints, and decision logs. Load YAML/JSON through shared parsing utilities, not ad-hoc string handling.

Keep the architecture layered: workflow belongs in `pipelines/*.yaml`, stage procedure belongs in Markdown director skills, provider prompting belongs in `skills/agents/`, concrete integrations belong in `src/tools/`, selection belongs in the registry, and orchestration belongs in the harness.

Use path-safe lowercase slugs for shows, pipelines, and playbooks; use exact snake_case enum values for canonical stages, artifacts, and decision categories. Director skill files follow `<stage>-director.md`; each tool is one default export declared with the registry helper.

Config merge semantics are contractual: objects merge by key, arrays replace, and `null` removes a key. Prefer structured errors with file path and actionable validation details over raw stack traces or raw Zod dumps.

## Non-Negotiables
Specs are the contract. If code and specs disagree, surface it; when behavior changes, update the relevant spec with the implementation.

Do not break consumer-facing shapes casually: `show.yaml`, `episode.yaml`, pipeline manifests, tool registry contracts, artifact schemas, checkpoints, and decision logs require migration handling for breaking changes.

Do not implement a new pipeline as orchestration code unless the specs prove it cannot be expressed as a manifest plus director skills. New code is for schemas, registry/tool behavior, filesystem/state logic, and reusable primitives.

All tool execution goes through the registry. Do not add ad-hoc scripts or direct provider calls that bypass tool availability, cost tracking, auth modeling, or Layer 3 vendor skills.

predit must not store credentials. CLI tools own CLI auth, API tools use environment variables, and setup behavior comes from each tool’s `integration.install`.

Preserve the harness/user-project boundary. This repo ships the CLI, bundled content, schemas, and templates; user-owned shows, runtime state, generated media, music libraries, and export packages live in user projects.

Checkpoint, review, approval, cost, and decision-log behavior are core product guarantees. Runtime code must not skip stage checkpoints, human approval gates, cost snapshots, reviewer findings, or material decision entries.
