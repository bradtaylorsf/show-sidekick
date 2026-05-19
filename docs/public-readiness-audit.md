# Public Readiness Audit

Date: 2026-05-19

Scope: tracked repository files, public docs, all packaged bundled content, Alpha Loop assets, workflow definitions, package contents, and standard local verification commands.

## Results

| Check | Command | Status | Detail |
|---|---|---|---|
| Public-flip gate | `pnpm release:check:full` | Pass | The public naming/cache/env gates passed with install/build/test, packed-tarball smoke, and starter smoke enabled. The stale-name gate now scans all packaged `bundled/` content, not only templates and skills. |
| High-confidence secret scan | `git grep` over tracked files for common key prefixes, private-key blocks, GitHub tokens, Slack tokens, Google API keys, and OpenAI-style keys | Pass | No high-confidence secret values were found. |
| Generic credential scan | `git grep` over tracked files for credential-shaped assignments | Pass | Hits were placeholders, example code, runtime env reads, or tokenization variables; no committed credential value was found. |
| Env examples | `git grep` over tracked env examples for nonblank assignments | Pass | `bundled/templates/user-project/.env.example` contains blank placeholder values only. |
| Private/local path scan | `git grep` over tracked files for private bridge names, sibling-source terms, and local absolute paths | Fixed | Removed obsolete private drift scripts/workflow and sanitized a local Windows path in `scripts/port-agent-skills.mjs`. Remaining private-bridge hits are the release guardrail implementation/tests. |
| Generated artifact scan | `git ls-files` filtered for runtime workspaces, logs, generated media, learnings, sessions, traces, and cache directories | Pass | No tracked `projects/`, `exports/`, `renders/`, runtime logs, Alpha Loop learnings/sessions/traces, or user cache directories were found. Tracked `.agents/` and `.claude/` files are the intentional synced agent assets. |
| TODO/FIXME scan | `git grep` over `README.md`, `docs`, `specs`, and `src` | Pass | One source TODO remains for a future schema promotion and is not a launch blocker. |
| Package contents | `npm pack --dry-run --json` | Pass | Dry-run packaging reports 2,002 files. The package contains `dist`, all shipped `bundled/` content, `docs`, `README.md`, `CHANGELOG.md`, `LICENSE`, and `package.json`; no runtime workspaces, private bridge assets, logs, bulky generated media, or generated learnings were included. Small starter/fixture media files are included intentionally, and packaged starters/fixtures/schemas/notes are now covered by the public-name/private-reference gate. |
| Lint | `pnpm lint` | Pass | Fallback lint passed. |
| Typecheck | `pnpm typecheck` | Pass | TypeScript typecheck passed. |
| Unit tests | `pnpm test` | Pass | 179 test files passed, 1 skipped; 1,040 tests passed, 2 skipped. |
| Build | `pnpm build` | Pass | TypeScript build completed successfully. |
| Provider docs | `pnpm run docs:providers:check` | Pass | Generated provider docs are current. |
| Zero-key smoke | `pnpm release:check:full`; `pnpm show-types:matrix --zero-key --json` | Pass | The full release gate ran starter smoke and packed-tarball smoke; the zero-key matrix verified 4 lanes and marked 22 paid/no-sample lanes unsupported. |

## Findings

- Fixed: removed obsolete private drift automation that depended on a non-public source inventory.
- Fixed: sanitized a concrete local absolute path in `scripts/port-agent-skills.mjs`.
- Fixed (#227/#228/#229): public naming, CLI binaries, user-project cache, and Show Sidekick-owned environment variables now use the Show Sidekick contract.
- Fixed (#239): packaged `bundled/` starters, fixtures, schemas, and notes no longer contain stale pre-public product names or private source references, and the release gate scans the full packaged `bundled/` tree.
- Verified: lint, typecheck, build, full test suite, provider docs check, show-type checks, zero-key matrix, changeset status, and release check all pass in the release worktree.
- Manual: the public-flip gate reports the pre-release GitHub issue milestone check as a manual step; it was not verified from this workspace.
