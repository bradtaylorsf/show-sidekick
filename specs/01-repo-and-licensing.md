# 01 — Repo and Licensing

## License

Apache License 2.0, applied at first public release. Until then the repo stays private; the `LICENSE` file already declares Apache 2.0 to signal intent.

## Visibility timeline

| Phase | Visibility | Notes |
|---|---|---|
| Build (current) | Private | Private build-era bridge material stays untracked and out of public docs |
| Pre-release | Private | Sanity sweep confirms no private source-path names are tracked |
| Public release | Public | Private bridge material removed; repo flipped public; first tag cut |

## Public-flip checklist

Run before flipping the repo public:

`pnpm release:check` runs the automated public-flip gate, including the bundled starter sample E2E. `pnpm release:check:full` also runs the fresh-clone install/build/test command sequence.

Record each release audit pass in [`docs/public-readiness-audit.md`](../docs/public-readiness-audit.md), including secret scans, tracked-file leak sweeps, package contents, standard local checks, zero-key smoke status, and any open blockers with their owning issue.

- [x] Private bridge material removed from the working tree
- [x] `git grep` for private source-path names returns no hits outside release guardrail code/tests
- [x] `LICENSE` present, Apache 2.0
- [x] `README.md` states what Show Sidekick does, requirements, install, quickstart
- [x] At least one fully working show + episode + pipeline ships in the repo as a runnable example
- [x] `showkick init --starter <name> && showkick build <show>/sample-episode --sample` succeeds end-to-end on a fresh clone with **zero API keys configured** (uses Piper TTS + Pixabay/Pexels free + ffmpeg)
- [x] `showkick watch` and `showkick import` work against a fixture drop folder
- [x] Smoke test runs green on a fresh clone (`pnpm install && pnpm build && pnpm test`)
- [x] CHANGELOG entry for v0.1.0
- [ ] All open issues tagged with the `pre-release` milestone are closed or moved to `post-release`
