## Architecture
- CLI package (`type: module`, Node 22+) exposes `showkick`, `show-sidekick`, and `showsidekick`, all built to `dist/cli/index.js` from `src/cli/index.ts`.
- `src/cli/index.ts` delegates to `createProgram()` in `src/cli/program.ts`; `program.ts` registers all commands and runs pre-action setup: logging, project-root detection, `.env` loading, and `.show-sidekick` cache refresh.
- No database. Persistent state is filesystem JSON/YAML: user intent in `shows/<show>/show.yaml` and `episodes/*.yaml`; runtime state in `projects/<show>/<episode>/state.json`, `checkpoints/*.json`, `decisions.json`, and `cost_log.json`.
- Key directories: `src/cli` commands, `src/harness` runner/dispatcher, `src/registry` tool discovery/selection, `src/tools` tool modules, `src/pipelines` manifest loading, `src/artifacts` schemas, `bundled/` shipped pipelines/skills/starters/schemas, `specs/` product contract.

## Conventions
- TypeScript ESM with `moduleResolution: NodeNext`, strict Zod-validated config loading, Commander CLI commands, YAML manifests, and JSON artifact/state files.
- Tests are Vitest files colocated as `src/**/*.test.ts` plus `tests/**/*.test.ts` and `scripts/**/*.test.ts`; run `pnpm test`, `pnpm typecheck`, `pnpm build`, and targeted smoke/release scripts from `package.json`.
- New CLI commands must be imported in `src/cli/program.ts`, added to `COMMAND_NAMES`, registered with Commander, and covered by command tests.
- New tools belong in one default-export module under `src/tools/` using `defineTool`; the registry auto-discovers non-test `.ts/.js` files and rejects duplicate tool names.
- New pipelines should be declarative YAML in `bundled/pipelines/` or project `pipelines/`, with matching Markdown director skills under `bundled/skills/pipelines/<pipeline>/`; orchestration logic should not move into TypeScript unless schemas/state/tool contracts require it.

## Critical Rules
- Specs are the contract; code/spec disagreement must be surfaced and fixed together, especially CLI, pipeline manifests, registry shape, checkpoints, exports, and user-project layout.
- Do not hand-edit synced Alpha Loop copies in `.agents/`, `.claude/`, or `.codex/`; edit `.alpha-loop/templates/` for source-of-truth agent assets.
- Treat `dist/`, `bundled/schemas/`, generated caches, runtime `projects/`, and release/demo artifacts carefully; source-of-truth code lives in `src/`, specs, scripts, and bundled authored content.
- User-owned overrides resolve before `.show-sidekick` cache resources; changing `projectPaths`, `resolve()`, cache refresh, or scaffold templates can break initialized projects.
- Avoid bypassing the registry with ad-hoc shell calls; paid/provider actions, availability, approval, and cost tracking depend on registry and `defineTool` execution wrappers.

## Active State
- Test status: (will be filled in by the loop)
- Recent changes: (will be filled in by the loop)
