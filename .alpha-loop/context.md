## Architecture
- CLI entry is `src/cli/index.ts` (`predit` bin builds to `dist/cli/index.js`), which calls `createProgram()` in `src/cli/program.ts`; command handlers live in `src/cli/commands/*.ts`.
- Build/run commands load targets via `src/cli/commands/run-target.ts`: project root detection, `show.yaml`, episode YAML, then pipeline manifest resolution.
- Database: none. State is filesystem-backed YAML/JSON; loaders query YAML via `src/config/loader.ts`, checkpoints via `src/checkpoints/io.ts`, decisions via `src/decisions/store.ts`, costs via `src/cost/tracker.ts`.
- Key directories: `src/tools/` default-export registry tools, `src/pipelines/` manifest/stage schemas, `src/shows/` show/episode schemas, `src/harness/` stage context/dispatcher, `bundled/` shipped pipelines/playbooks/skills/schemas/templates, `specs/` source-of-truth design.

## Conventions
- TypeScript ESM, Node >=22, `moduleResolution: NodeNext`, strict TS; schemas are Zod-first, config is YAML via `yaml`, writes are usually atomic JSON/YAML files.
- CLI uses `commander`; global flags are registered in `src/cli/program.ts`, and logging mode is configured in the `preAction` hook.
- Tests use Vitest in Node mode; files are `src/**/*.test.ts` and `tests/**/*.test.ts`; run `pnpm test`, `pnpm typecheck`, `pnpm build`.
- New commands must be imported and registered in `src/cli/program.ts`; new tools go in `src/tools/*.ts` as default exported `defineTool(...)`; new pipelines need a YAML manifest plus director skills, not orchestration code.

## Critical Rules
- Specs are contractual; if code behavior changes, update the relevant `specs/*.md` in the same change.
- Do not commit or reference `.migration/`; it is private reference material only.
- `.alpha-loop/templates/` is the source for loop agent assets; `.claude/`, `.codex/`, and `.agents/` are synced outputs.
- Keep pipeline layers separate: manifests in `bundled/pipelines/`, director skills in `bundled/skills/pipelines/`, concrete integrations in `src/tools/`.
- Integration points that must stay aligned: pipeline stage `skill`/slug names with director skill files, artifact Zod schemas with generated `bundled/schemas/`, CLI command surface with README/tests, and tool registry shape/tests.

## Active State
- Test status: (will be filled in by the loop)
- Recent changes: (will be filled in by the loop)
