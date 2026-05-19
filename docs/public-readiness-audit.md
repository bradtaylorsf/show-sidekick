# Public Readiness Audit

Date: 2026-05-19

Scope: tracked repository files, public docs, bundled templates and skills, starter content, Alpha Loop assets, workflow definitions, package contents, and standard local verification commands.

## Results

| Check | Command | Status | Detail |
|---|---|---|---|
| Public-flip gate | `node --import tsx scripts/public-flip-checklist.ts --with-build --with-e2e --json` | Pending rerun | The public naming/cache/env gates are now implemented for the Show Sidekick rename. Maintainers should rerun the full gate in a fully installed checkout immediately before publishing. |
| High-confidence secret scan | `git grep` over tracked files for common key prefixes, private-key blocks, GitHub tokens, Slack tokens, Google API keys, and OpenAI-style keys | Pass | No high-confidence secret values were found. |
| Generic credential scan | `git grep` over tracked files for credential-shaped assignments | Pass | Hits were placeholders, example code, runtime env reads, or tokenization variables; no committed credential value was found. |
| Env examples | `git grep` over tracked env examples for nonblank assignments | Pass | `bundled/templates/user-project/.env.example` contains blank placeholder values only. |
| Private/local path scan | `git grep` over tracked files for private bridge names, sibling-source terms, and local absolute paths | Fixed | Removed obsolete private drift scripts/workflow and sanitized a local Windows path in `scripts/port-agent-skills.mjs`. Remaining private-bridge hits are the release guardrail implementation/tests. |
| Generated artifact scan | `git ls-files` filtered for runtime workspaces, logs, generated media, learnings, sessions, traces, and cache directories | Pass | No tracked `projects/`, `exports/`, `renders/`, runtime logs, Alpha Loop learnings/sessions/traces, or user cache directories were found. Tracked `.agents/` and `.claude/` files are the intentional synced agent assets. |
| TODO/FIXME scan | `git grep` over `README.md`, `docs`, `specs`, and `src` | Pass | One source TODO remains for a future schema promotion and is not a launch blocker. |
| Package contents | `env npm_config_cache=<temp-cache> npm pack --dry-run --json` | Pass | Dry-run packaging completed with a writable temp npm cache: 1,997 files, 1,840,782-byte tarball, 9,008,598 bytes unpacked. The package contains `dist`, `bundled`, `docs`, `README.md`, `CHANGELOG.md`, `LICENSE`, and `package.json`; no runtime workspaces, private bridge assets, logs, bulky generated media, or generated learnings were included. Small starter/fixture media files are included intentionally. |
| Lint | `pnpm lint` | Pass | Fallback lint passed. |
| Typecheck | `pnpm typecheck` | Pending rerun | Re-run after dependency installation in the release workspace. |
| Unit tests | `pnpm test` | Pending rerun | Re-run after dependency installation in the release workspace. |
| Build | `pnpm build` | Pending rerun | Re-run after dependency installation in the release workspace. |
| Provider docs | `pnpm run docs:providers:check` | Pass | Generated provider docs are current. |
| Zero-key smoke | `pnpm run test:smoke` | Pending rerun | Re-run after dependency installation in the release workspace. |

## Findings

- Fixed: removed obsolete private drift automation that depended on a non-public source inventory.
- Fixed: sanitized a concrete local absolute path in `scripts/port-agent-skills.mjs`.
- Fixed (#227/#228/#229): public naming, CLI binaries, user-project cache, and Show Sidekick-owned environment variables now use the Show Sidekick contract.
- Pending rerun: maintainers should rerun the full public-flip install/build/test/e2e path in the release checkout before publishing.
- Manual: the public-flip gate reports the pre-release GitHub issue milestone check as a manual step; it was not verified from this workspace.
