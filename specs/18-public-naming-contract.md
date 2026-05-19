# 18 — Public Naming Contract

## Decision

The public product name is **Show Sidekick**.

| Surface | Reserved identifier |
|---|---|
| Product display name | `Show Sidekick` |
| npm package | `show-sidekick` |
| Primary CLI | `showkick` |
| CLI aliases | `show-sidekick`, `showsidekick` |
| Domain | `showsidekick.com` |
| Website URL | `https://showsidekick.com` |
| Docs URL | `https://showsidekick.com/docs` |
| User-project cache | `.show-sidekick/` |
| Cache version file | `.show-sidekick/version.json` |
| Future lockfile | `show-sidekick.lock` |
| Environment prefix | `SHOW_SIDEKICK_` |

`predit` is a pre-public implementation name. It does not remain as a public npm package, package binary, CLI command, cache name, docs vocabulary, or environment prefix.

## Compatibility

The public release is a hard rename for the npm package and CLI: no `predit` binary alias is retained.

Pre-public user projects may still contain `.predit/` caches. The harness migrates that cache to `.show-sidekick/` when possible and keeps the migration path only through `v0.2.0`. Legacy `PREDIT_*` environment variables are not accepted as public configuration; commands must fail with migration guidance that names the matching `SHOW_SIDEKICK_*` variable.

## Repository Constants

Public identifiers must be read from `src/branding.ts` rather than retyped across runtime code, tests, docs checks, or release automation. The constants are the source of truth for product display name, package name, CLI binaries, cache directory, lockfile name, environment prefix, and docs URLs.

## npm Availability Gate

Before publishing, the release operator must re-check all reserved npm names from a networked environment and paste the dated command output into the release notes or this decision record.

Command:

```bash
for name in show-sidekick showkick show-kick showsidekick; do
  printf '## %s\n' "$name"
  npm view "$name" name version --registry=https://registry.npmjs.org/
done
```

Attempt recorded on 2026-05-19 from this implementation workspace:

```text
## show-sidekick
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/show-sidekick - Not found
npm error 404 The requested resource 'show-sidekick@*' could not be found or you do not have permission to access it.
## showkick
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/showkick - Not found
npm error 404 The requested resource 'showkick@*' could not be found or you do not have permission to access it.
## show-kick
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/show-kick - Not found
npm error 404 The requested resource 'show-kick@*' could not be found or you do not have permission to access it.
## showsidekick
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/showsidekick - Not found
npm error 404 The requested resource 'showsidekick@*' could not be found or you do not have permission to access it.
```

Decision: the 2026-05-19 registry check found no published packages for the reserved names. Keep `show-sidekick` as the intended package and `showkick` as the primary CLI. Re-run the command during the final release gate in case any name is claimed before publishing.
