# Public Release Checklist

This is the human-owned release playbook for maintainers. Automation lives in [`release.yml`](../.github/workflows/release.yml) and `pnpm release:check`; this document covers setup, judgement calls, support triage, and rollback steps that should not be hidden inside CI.

## Pre-Release Ownership

- Reserve the `show-sidekick` npm package and confirm the package owner set includes at least two maintainers.
- Configure npm trusted publishing for this repository, using the GitHub `npm` environment and OIDC provenance.
- Protect the release branch with required CI, review, and no direct pushes.
- Configure GitHub environments for release publishing, including required reviewers for the `npm` environment.
- Confirm domain ownership and DNS access for the public website and install prompt.
- Update the GitHub repository description, website URL, and topics so the project is discoverable as Show Sidekick.

## Release Checklist

- Review README, quickstart, provider docs, demo readiness, show types, and changelog for the target version.
- Review the [public readiness audit](public-readiness-audit.md) and confirm every open blocker is fixed, moved to a tracked release issue, or intentionally deferred.
- Run `pnpm show-types:check`.
- Run `pnpm show-types:matrix -- --zero-key` and archive the generated report.
- Run the no-key animated explainer path from a fresh user project.
- Run `showkick doctor --profile paid-demo` in the paid-demo environment and confirm expected providers are green.
- Run at least one paid-demo preflight lane when provider credentials and budget are approved.
- Run `pnpm release:check` from a clean checkout after the package has been built.
- Run `npm publish --dry-run --provenance --access public`.
- Publish through the Changesets release workflow and confirm the npm package shows provenance.
- Create or verify the GitHub Release, including the show-type validation report link.
- Verify the website install prompt uses the published `show-sidekick` version and the `showkick` binary.

## Rollback

- For a bad npm release, run `npm deprecate show-sidekick@<version> "<reason and fixed version>"`.
- Publish a patch version as soon as the fix is verified through `pnpm release:check`.
- Pin the website install prompt to the last known-good version until `latest` is safe again.
- Communicate cache migration fixes by telling users to run `showkick update` in affected projects.
- Communicate env migration fixes by naming the current `SHOW_SIDEKICK_` variables and any temporary compatibility aliases that remain active.
- Add the incident, affected versions, fix version, and user action to the GitHub Release notes and support channels.

## Support Triage

- macOS installs: check Node 22+, npm, Git, FFmpeg, ffprobe, quarantine or Gatekeeper warnings for provider CLIs, shell `PATH`, and whether the terminal has needed media permissions.
- Windows installs: check Node 22+, npm, Git, FFmpeg and ffprobe on `PATH`, PowerShell execution policy issues for provider CLIs, long paths, and quoting of project paths with spaces.
- Optional runtimes: Python and uv are useful for specialized local tools, but they are not blockers for the first no-key animated explainer.
- Provider keys: confirm users placed keys in the generated private env file or exported shell environment, not committed docs or show files.
- Paid generation: verify the user approved the provider, model or tool, purpose, sample/full-run scope, and rough cost before any command that may spend credits.
- Cache restore: if a cloned project is missing its bundled cache, run `showkick update --check` and then `showkick update` if needed.
