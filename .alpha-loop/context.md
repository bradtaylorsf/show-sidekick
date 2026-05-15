## Architecture
- CLI entry is `src/cli/index.ts`, built to `dist/cli/index.js` and exposed as `predit`; it calls `createProgram()` in `src/cli/program.ts`, which imports/registers every command handler.
- `predit build` loads `<show>/<episode>` via `src/cli/commands/run-target.ts`, selects a pipeline/playbook, discovers tools with `src/registry/registry.ts`, then runs stages through `src/harness/runner.ts` and a dispatcher.
- No database: persistent state is YAML/JSON on disk. Authoring lives in `shows/*/*.yaml`; runtime state/checkpoints/costs/artifacts live under `projects/<show>/<episode>/`; schemas are Zod in `src/**` plus generated JSON schemas in `bundled/schemas/`.
- Key directories: `src/cli` commands, `src/harness` orchestration, `src/registry` tool selection, `src/tools` integrations, `src/artifacts` schemas, `src/checkpoints` state IO, `bundled/` shipped pipelines/playbooks/skills/starters/templates.

## Conventions
- TypeScript, Node 22+, ESM/`NodeNext`, strict `tsconfig`; Commander for CLI, Zod for validation, `yaml` for config parsing.
- Tests use Vitest in Node mode; unit tests are colocated as `src/**/*.test.ts`, broader smoke/schema/release tests live under `tests/`; run with `pnpm test`, `pnpm typecheck`, `pnpm build`.
- New CLI commands must be imported and registered in `src/cli/program.ts`; command logic belongs in `src/cli/commands/*`.
- New tools live as one default-exported `defineTool(...)` module in `src/tools/`; new pipelines should usually be `bundled/pipelines/*.yaml` plus director skills in `bundled/skills/pipelines/<pipeline>/`.

## Critical Rules
- Specs are the contract: update `specs/` with behavioral changes; breaking `show.yaml`, `episode.yaml`, pipeline manifests, registry shape, or checkpoint schemas needs migration/version handling.
- Do not edit or reference `.migration/` unless explicitly asked; Alpha Loop assets should be changed in `.alpha-loop/templates/`, not directly in synced `.claude/`, `.codex/`, or `.agents/`.
- Keep layers separate: pipeline workflow stays declarative YAML, how-to stays Markdown skills, concrete execution stays in `src/tools/`; no ad-hoc shell scripts around the registry.
- Artifact changes must update Zod/schema generation together: `src/artifacts/json-schema.ts`, checked-in `bundled/schemas/artifacts/*.schema.json`, and `pnpm generate:schemas`.

## Active State
- Test status: (will be filled in by the loop)
- Recent changes: (will be filled in by the loop)
- Open risks: (will be filled in by the loop)
