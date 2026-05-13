Analyze the following GitHub issues and produce a structured implementation plan for EACH one.

## Parent Epic Context

Epic #116: Epic 1 — Foundation

### Goal / Body Summary
## Goal

Establish the project skeleton, CLI bones, all Zod schemas, and the Tool registry core so Phase B epics can fork in parallel work trees.

## Rationale

This parent epic was generated from `IMPLEMENTATION.md` for Phase A — Foundation.

Sequencing: Serial. Must complete before Phase B.

## Ordered Work

## Source

- `IMPLEMENTATION.md`

## Implementation Guide Excerpt

**Goal.** Establish the project skeleton, CLI bones, all Zod schemas, and the Tool registry core so Phase B epics can fork in parallel work trees.

**Sequencing.** Serial. Must complete before Phase B.

**Status when complete.** A `predit` CLI binary that loads/validates show, episode, pipeline, and all artifact YAML/JSON; a Registry that can discover and probe tools; a working Vitest test loop.

## Batch 1.A — Scaffold + utilities

*Parallel-safe within batch.* Five items with no inter-dependencies; a second concurrent loop on Epic 1 can pull any of them next.

## Batch 1.B — Zod schemas

*Parallel-safe within batch.* Five schema-authoring tasks, all independent. The artifact-schema items can absorb the audit's enumeration requirements (full enum surfaces, threshold constants).

## Batch 1.C — Registry core
...(truncated)

### Acceptance Criteria
- [ ] All ordered child issues are complete.
- [ ] Child issue acceptance criteria are satisfied.
- [ ] Integration-sensitive behavior across sibling issues is verified before closing this epic.
- [ ] A `predit` CLI binary that loads/validates show, episode, pipeline, and all artifact YAML/JSON; a Registry that can discover and probe tools; a working Vitest test loop.

### Ordered Sub-Issue Checklist
1. [ ] #1 F-1 — Project scaffolding + Vitest setup
2. [ ] #2 F-2 — CLI skeleton with Commander
3. [ ] #3 F-3 — YAML + Zod config loader
4. [ ] #4 F-4 — Logger primitives + global flag wiring
5. [ ] #5 F-5 — Path resolution + project root detection + env loader
6. [ ] #6 F-6 — Show + Episode schemas + deep-merge
7. [ ] #7 F-7 — Pipeline manifest Zod schema
8. [ ] #8 F-8 — Artifact schemas — creative
9. [ ] #9 F-9 — Artifact schemas — execution
10. [ ] #10 F-10 — Artifact schemas — character animation + checkpoint
11. [ ] #11 F-11 — Tool interface + Integration discriminated union + `defineTool`
12. [ ] #12 F-12 — Registry class (discover + lookup)
13. [ ] #13 F-13 — Availability checks per integration kind + `select()` routing

### Epic Scope Guidance
- Plan only the listed batch issues. Use unchecked sibling items to identify integration boundaries, not to expand this batch scope.

## Issues to Plan

### Issue #1: F-1 — Project scaffolding + Vitest setup
## Summary

Implement `F-1 — Project scaffolding + Vitest setup` from `IMPLEMENTATION.md`.

## Alpha Loop Context

- Phase: Phase A — Foundation
- Parent epic: Epic 1 — Foundation
- Batch: 1.A — Scaffold + utilities
- Source: `IMPLEMENTATION.md`

## Implementation Guide Excerpt

**Standard acceptance.**
- [ ] `src/` tree with placeholder index files: `harness/`, `registry/`, `tools/`, `audio/`, `shows/`, `checkpoints/`, `decisions/`, `cli/`, `remotion/`.
- [ ] `pnpm install` succeeds against the pinned `package.json`.
- [ ] `pnpm typecheck` passes on the placeholder tree.
- [ ] `pnpm build` produces `dist/cli/index.js` that prints `"predit v0.0.0"` on invocation.
- [ ] Vitest configured; `pnpm test` exits 0 (no tests yet OK).
- [ ] `pnpm test:watch` works for iterative TDD.

**Cross-references.** `specs/02-build-stack.md`.

### Issue #2: F-2 — CLI skeleton with Commander
## Summary

Implement `F-2 — CLI skeleton with Commander` from `IMPLEMENTATION.md`.

## Alpha Loop Context

- Phase: Phase A — Foundation
- Parent epic: Epic 1 — Foundation
- Batch: 1.A — Scaffold + utilities
- Source: `IMPLEMENTATION.md`

## Implementation Guide Excerpt

**Standard acceptance.**
- [ ] `predit --help` lists every command from `specs/03-cli.md` (init, doctor, new, build, resume, status, approve, revise, ls, show, export, import, watch, setup, tools, update).
- [ ] Every command has a stub handler that respects `--json` (NDJSON) vs human-readable.
- [ ] Unknown commands exit non-zero with a fuzzy-match suggestion.
- [ ] Global flags (`--json`, `--dry-run`, `--verbose`, `--no-color`, `--config`) defined at program level.
- [ ] `--verbose` enables a debug log channel that prints to stderr.

**Cross-references.** `specs/03-cli.md`.

### Issue #3: F-3 — YAML + Zod config loader
## Summary

Implement `F-3 — YAML + Zod config loader` from `IMPLEMENTATION.md`.

## Alpha Loop Context

- Phase: Phase A — Foundation
- Parent epic: Epic 1 — Foundation
- Batch: 1.A — Scaffold + utilities
- Source: `IMPLEMENTATION.md`

## Implementation Guide Excerpt

**Standard acceptance.**
- [ ] `src/config/loader.ts` exports `loadYaml<T>(path, schema)` and `loadJson<T>(path, schema)`.
- [ ] On valid input: returns typed value.
- [ ] On invalid input: throws structured `ConfigError` with file path, line, and human-readable issue list (not raw Zod errors).
- [ ] Unit tests cover: happy path, missing file, malformed YAML, schema violation.

### Issue #4: F-4 — Logger primitives + global flag wiring
## Summary

Implement `F-4 — Logger primitives + global flag wiring` from `IMPLEMENTATION.md`.

## Alpha Loop Context

- Phase: Phase A — Foundation
- Parent epic: Epic 1 — Foundation
- Batch: 1.A — Scaffold + utilities
- Source: `IMPLEMENTATION.md`

## Implementation Guide Excerpt

**Standard acceptance.**
- [ ] `src/log/logger.ts` exports `info`, `warn`, `error`, `debug`, `event(name, payload)`.
- [ ] All methods callable from any subsystem without circular import issues.
- [ ] `--json` mode emits NDJSON to stdout; human-readable info goes to stderr in JSON mode.
- [ ] `--no-color` strips ANSI codes; `picocolors` honored elsewhere.
- [ ] Tests verify `--json` produces parseable NDJSON.

### Issue #5: F-5 — Path resolution + project root detection + env loader
## Summary

Implement `F-5 — Path resolution + project root detection + env loader` from `IMPLEMENTATION.md`.

## Alpha Loop Context

- Phase: Phase A — Foundation
- Parent epic: Epic 1 — Foundation
- Batch: 1.A — Scaffold + utilities
- Source: `IMPLEMENTATION.md`

## Implementation Guide Excerpt

**Standard acceptance.**
- [ ] `src/paths/project.ts`:
  - `findProjectRoot(cwd)` walks up looking for `CLAUDE.md` + `.predit/`; throws structured error if none.
  - `resolve(kind, name)` checks local-override path first, then `.predit/` cache.
  - Returns absolute paths for `shows/`, `pipelines/`, `playbooks/`, `skills/`, `.predit/`, `projects/`, `music_library/`.
  - `parseShowEpisode("<show>/<episode>")` returns typed file paths.
- [ ] Tests cover: project root in cwd, in ancestor, no project root anywhere.
- [ ] Env loader: precedence is `.env.local` > `.env.<command>` > `.env`, with process env always winning.
- [ ] `requireEnv(name)` throws if missing; `optionalEnv(name)` returns `undefined`.

## Output

Write one JSON file per issue: plan-issue-1.json, plan-issue-2.json, plan-issue-3.json, plan-issue-4.json, plan-issue-5.json

Each file must contain ONLY valid JSON with this exact schema:

{
  "summary": "One-line description of what needs to be done",
  "files": ["src/path/to/file.ts", "..."],
  "implementation": "Concise step-by-step plan. What to create, modify, wire up.",
  "testing": {
    "needed": true,
    "reason": "Why tests are or aren't needed for this change"
  },
  "verification": {
    "needed": false,
    "instructions": "If needed: specific steps to verify the feature.",
    "reason": "Why verification is or isn't needed"
  },
  "dependency_chain": [
    {
      "what": "service or module this feature depends on",
      "where_created": "file:line where it's instantiated",
      "where_consumed": "file:line where this feature uses it",
      "verified": true
    }
  ]
}

## Rules
- Consider dependencies BETWEEN issues — if issue A creates something issue B uses, note that in the plan.
- For each dependency your plan references, grep the codebase to verify it exists and note where it is instantiated. Set verified=true only if you confirmed the dependency exists.
- testing.needed: true if ANY code changes could affect behavior. false only for docs, config, or comments.
- verification.needed: true ONLY if the issue changes user-visible UI that can be tested in a browser.
- implementation: be concise and actionable. List files to modify and what to change in each.
- Write ONLY the JSON files. Do not create any other files or make any code changes.