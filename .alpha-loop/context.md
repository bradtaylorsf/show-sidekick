## Architecture
- CLI entry is `src/cli/index.ts` (`bin: predit` compiles to `dist/cli/index.js`); it creates the Commander program in `src/cli/program.ts`, which imports handlers from `src/cli/commands/*.ts`.
- `build` resolves `<show>/<episode>` via `src/cli/commands/run-target.ts`, loads `show.yaml`, episode YAML, and pipeline YAML, then runs `Runner.run` in `src/harness/runner.ts` with a dispatcher and registry.
- No database: state is file-backed JSON/YAML. Runtime data lives under `projects/<show>/<episode>/` (`state.json`, `checkpoints/*.json`, `decisions.json`) and is accessed through `src/checkpoints/`, `src/decisions/`, and `src/cost/`.
- Key directories: `src/tools/` registry tools, `src/pipelines/` manifest loading/schema, `src/shows/` show/episode schemas, `src/export/` NLE handoff, `bundled/` shipped pipelines/skills/starters/schemas.

## Conventions
- TypeScript ESM on Node 22, `moduleResolution: NodeNext`, strict mode; validation is mostly Zod, config parsing uses `yaml`, CLI uses `commander`.
- Tests are Vitest files under `src/**/*.test.ts`, `tests/**/*.test.ts`, and `scripts/**/*.test.ts`; run with `pnpm test`, with `pnpm typecheck` for `tsc --noEmit`.
- New CLI commands must be imported and registered in `src/cli/program.ts`; command behavior belongs in `src/cli/commands/`.
- New tools should default-export `defineTool(...)` from `src/tools/*.ts`; `Registry.discover()` imports tool modules and selects by capability/availability/preference.

## Critical Rules
- Specs in `specs/` are the contract; if behavior changes, update the relevant spec with the code.
- Do not modify or reference `.migration/` in committed/public files; it is private study material only.
- Keep pipelines declarative: workflow belongs in `pipelines/*.yaml` and director skills, concrete integrations in `src/tools/`, not mixed into orchestration code.
- Consumer contracts need care: `show.yaml`, `episode.yaml`, tool shape, pipeline manifests, checkpoints, and bundled cache behavior can break user projects if changed casually.
- Alpha Loop assets sync from `.alpha-loop/templates/` into agent folders; avoid hand-editing synced copies unless debugging sync output.

## Active State
- Test status: (will be filled in by the loop)
- Recent changes: (will be filled in by the loop)
- Loop config: `.alpha-loop.yaml` uses Codex for implement/test/verify, Claude for plan/review, with `pnpm test -- --passWithNoTests && (test ! -d src || pnpm typecheck)`.
