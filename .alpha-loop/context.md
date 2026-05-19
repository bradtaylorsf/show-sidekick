## Architecture
- CLI entry is `src/cli/index.ts`, exposed as `showkick` via `dist/cli/index.js`; it calls `createProgram()` in `src/cli/program.ts`, which registers all Commander commands and pre-action project/cache/env setup.
- `build` loads `show.yaml`, `episode.yaml`, and the selected pipeline via `src/cli/commands/run-target.ts`, discovers tools from `src/tools/`, then runs stages through `src/harness/runner.ts` and dispatchers in `src/harness/dispatcher.ts`.
- No database: state is filesystem YAML/JSON. Schemas live beside domains (`src/shows`, `src/pipelines`, `src/artifacts`, `src/checkpoints`) and are loaded with Zod-backed `loadYaml`/`loadJson`.
- Key directories: `src/cli` commands, `src/harness` orchestration, `src/registry` tool discovery/selection, `src/tools` integrations, `bundled/` shipped pipelines/playbooks/skills/starters, `specs/` product contract.

## Conventions
- TypeScript ESM (`NodeNext`) on Node 22+, strict `tsc`; core libs are Commander, Zod, YAML, and picocolors.
- Tests are Vitest, mostly colocated as `src/**/*.test.ts` plus `tests/**/*.test.ts` and `scripts/**/*.test.ts`; run `pnpm test`, `pnpm typecheck`, `pnpm build`.
- New CLI commands must be wired in `src/cli/program.ts`; command logic lives under `src/cli/commands/`.
- New tools default-export a `defineTool(...)`-shaped object from `src/tools/`; the registry imports modules automatically, enforces unique names, probes availability, and selects by capability.
- New pipelines should be manifest + director skills in `bundled/pipelines` and `bundled/skills`, not new orchestration code unless filesystem/schema/registry logic is truly needed.

## Critical Rules
- Specs are the contract: if code and `specs/` disagree, surface it and update the relevant spec with the code change.
- Do not break user contracts casually: `show.yaml`, `episode.yaml`, pipeline manifests, tool shape, checkpoint schemas, and editor exports are consumer-facing.
- `.alpha-loop/templates/` is the source for loop agent/skill assets; do not hand-edit synced `.claude/`, `.codex/`, or `.agents/` copies except when debugging sync output.
- User project resolution depends on local resources overriding the `.show-sidekick/` cache; legacy `.predit/` migration, cache refresh/version behavior, and project-root detection in `src/cli/program.ts`, `src/version/*`, and `src/paths/project.ts` must stay aligned.
- Do not commit credentials or generated/runtime output; `.env*`, `projects/`, `exports/`, `renders/`, caches, and loop traces are intentionally ignored.

## Active State
- Test status: (will be filled in by the loop)
- Recent changes: (will be filled in by the loop)
- Project phase: README describes this as a v0.1.0 public-flip candidate with CLI, bundled content, registry, runner, and NLE handoff in active alpha.
