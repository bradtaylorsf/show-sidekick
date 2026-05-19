# Public Readiness Audit

Date: 2026-05-19

Scope: tracked repository files, public docs, bundled templates and skills, starter content, Alpha Loop assets, workflow definitions, package contents, and standard local verification commands.

## Results

| Check | Command | Status | Detail |
|---|---|---|---|
| Public-flip gate | `node --import tsx scripts/public-flip-checklist.ts --with-build --with-e2e --json` | Fail | Private bridge removal, sibling-path scan, docs links, provider catalog, license, README, changelog, bundled fixtures, and watch/import fixture checks passed. Rename/cache/env gates remain open and are tracked below. Fresh install/build/test and e2e lanes could not complete in this workspace because dependency installation is blocked. |
| High-confidence secret scan | `git grep` over tracked files for common key prefixes, private-key blocks, GitHub tokens, Slack tokens, Google API keys, and OpenAI-style keys | Pass | No high-confidence secret values were found. |
| Generic credential scan | `git grep` over tracked files for credential-shaped assignments | Pass | Hits were placeholders, example code, runtime env reads, or tokenization variables; no committed credential value was found. |
| Env examples | `git grep` over tracked env examples for nonblank assignments | Pass | `bundled/templates/user-project/.env.example` contains blank placeholder values only. |
| Private/local path scan | `git grep` over tracked files for private bridge names, sibling-source terms, and local absolute paths | Fixed | Removed obsolete private drift scripts/workflow and sanitized a local Windows path in `scripts/port-agent-skills.mjs`. Remaining private-bridge hits are the release guardrail implementation/tests. |
| Generated artifact scan | `git ls-files` filtered for runtime workspaces, logs, generated media, learnings, sessions, traces, and cache directories | Pass | No tracked `projects/`, `exports/`, `renders/`, runtime logs, Alpha Loop learnings/sessions/traces, or user cache directories were found. Tracked `.agents/` and `.claude/` files are the intentional synced agent assets. |
| TODO/FIXME scan | `git grep` over `README.md`, `docs`, `specs`, and `src` | Pass | One source TODO remains for a future schema promotion and is not a launch blocker. |
| Package contents | `env npm_config_cache=<temp-cache> npm pack --dry-run --json` | Pass | Dry-run packaging completed with a writable temp npm cache: 1,997 files, 1,840,782-byte tarball, 9,008,598 bytes unpacked. The package contains `dist`, `bundled`, `docs`, `README.md`, `CHANGELOG.md`, `LICENSE`, and `package.json`; no runtime workspaces, private bridge assets, logs, bulky generated media, or generated learnings were included. Small starter/fixture media files are included intentionally. |
| Lint | `pnpm lint` | Pass | Fallback lint passed. |
| Typecheck | `pnpm typecheck` | Blocked | Failed with `tsc: command not found` because local dependency binaries are not linked. |
| Unit tests | `pnpm test` | Blocked | Failed with `vitest: command not found` because local dependency binaries are not linked. |
| Build | `pnpm build` | Blocked | Failed with `tsc: command not found` because local dependency binaries are not linked. |
| Provider docs | `pnpm run docs:providers:check` | Pass | Generated provider docs are current. |
| Zero-key smoke | `pnpm run test:smoke` | Blocked | Failed with `vitest: command not found` because local dependency binaries are not linked. |

## Findings

- Fixed: removed obsolete private drift automation that depended on a non-public source inventory.
- Fixed: sanitized a concrete local absolute path in `scripts/port-agent-skills.mjs`.
- Open (#227/#228/#229): package name/bin still use `predit`, cache references still use `.predit/`, and env vars still use `PREDIT_`; this audit records the blocker but leaves the rename contract to those sibling issues.
- Blocked locally: dependency installation could not be restored in this workspace. `pnpm install --frozen-lockfile --offline` failed because at least one tarball was missing from the local store, and the full public-flip install path also hit restricted registry access. Maintainers should rerun the blocked standard checks in a fully installed checkout before publishing.
- Manual: the public-flip gate reports the pre-release GitHub issue milestone check as a manual step; it was not verified from this workspace.
