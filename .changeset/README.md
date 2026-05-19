# Changesets

Show Sidekick uses Changesets for release PRs, changelog updates, tags, GitHub Releases, and npm publishing.

Normal user-facing PRs must include a changeset:

```bash
pnpm changeset
```

Non-release PRs must carry the `no-release` label. CI runs `pnpm changeset:status` against `origin/main` unless that label is present.

The release workflow publishes with npm trusted publishing/OIDC and `npm publish --provenance --access public`. Maintainers must configure the npm package and GitHub environment for trusted publishing before the release PR can publish. Do not add long-lived npm tokens unless trusted publishing is unavailable and the fallback is explicitly documented in a follow-up change.

Publishing is intentionally blocked until the package name is `show-sidekick` and the SR-10 launch gates are green.
