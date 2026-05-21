# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Changed

- Locked the public naming contract for Show Sidekick: npm package `show-sidekick`, primary CLI `showkick`, CLI aliases `show-sidekick` and `showsidekick`, domain `showsidekick.com`, cache `.show-sidekick/`, and env prefix `SHOW_SIDEKICK_`.
- Recorded the npm availability publish gate for `show-sidekick`, `showkick`, `show-kick`, and `showsidekick`; the 2026-05-19 registry check returned `E404` for each name, so `show-sidekick` remains the intended public package and `showkick` the primary CLI.

## [0.1.0] - 2026-05-14

### Migration Note

- Public launch renames build-era `predit` to Show Sidekick, with npm package `show-sidekick` and CLI `showkick`.
- User-project cache/docs move from `.predit/` to `.show-sidekick/`. Legacy `PREDIT_*` env vars fail with guidance to rename them to matching `SHOW_SIDEKICK_*` names.

### Added

- Public README, [quickstart](docs/quickstart.md), contributor guide, generated [provider catalog](docs/providers.md), and user-project roadmap template.
- CLI lifecycle commands for `init`, `update`, `doctor`, and `setup`.
- Integrated build runner with checkpoints, approvals, resume state, first paid-call approval, and cost budget enforcement.
- Reviewer and audit flow for final review, force approvals, decision logging, and cost/status reporting.
- NLE exporters for Premiere XML, DaVinci XML, CapCut draft packages, and CMX 3600 EDL.
- `import` and `watch` flows for turning watched media drops into episode YAML.
- Generalized bundled starter shows with fixture-backed sample projects across music videos, news songs, cinematic trailers, animated explainers, screen demos, product demos, documentary montages, and source-led repurposing workflows.
- Registry-driven tool selection with generated provider documentation and CI freshness checks.
- Zero-key sample render path for bundled starters and framework smoke validation.
- Public release verification with `pnpm release:check` and `pnpm release:check:full`.

See the [README](README.md) for the current command surface.
