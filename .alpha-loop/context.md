## Architecture
- CLI package skeleton: `package.json` exposes `predit` as `dist/cli/index.js`; `pnpm dev` is wired to `tsx watch src/cli/index.ts`, but `src/` is not present yet.
- Planned runtime is a thin TypeScript harness: `src/cli/` commands drive `src/harness/runner.ts`, which loads show/episode context, plans pipeline stages, checkpoints, and calls agents/tools.
- Database: none. Runtime state is planned as JSON under `projects/<show>/<episode>/state.json`, with checkpoints in `projects/<show>/<episode>/checkpoints/*.json`.
- Key directories: `specs/` is the source of truth; `bundled/templates/user-project/` contains scaffolded user-project agent files; `.alpha-loop/` contains automation templates; `.migration/` is private gitignored reference material.

## Conventions
- Node 22, pnpm 9, ESM TypeScript, strict `tsconfig.json`; build uses `tsc`, no bundler.
- CLI uses Commander; validation uses Zod; YAML parsing uses `yaml`; terminal color uses `picocolors`.
- Tests are planned as Vitest tests colocated with source files (`src/foo.ts` and `src/foo.test.ts`), run with `pnpm test`; type checks run with `pnpm typecheck`.
- New features should follow the spec layer split: workflow in `pipelines/*.yaml`, stage instructions in Markdown skills, concrete integrations in `src/tools/`, orchestration only when filesystem/schema/registry logic requires code.

## Critical Rules
- Specs are contractual. If implementation and specs disagree, update the relevant spec in the same change or surface the discrepancy.
- Do not edit or publish `.migration/`; treat it only as private study material and never copy from it into product files.
- Do not break consumer-facing shapes without migration work: `show.yaml`, `episode.yaml`, pipeline manifests, tool registry contracts, checkpoint schemas.
- Tools must be invoked through the registry, not ad-hoc shell scripts; tests should use the same registry path.
- Do not confuse harness-agent rules with user-production rules: root `AGENTS.md` is for this repo; scaffolded user projects use `bundled/templates/user-project/AGENTS.md`.

## Active State
- Test status: (will be filled in by the loop)
- Recent changes: (will be filled in by the loop)
