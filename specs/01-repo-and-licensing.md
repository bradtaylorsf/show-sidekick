# 01 — Repo and Licensing

## License

Apache License 2.0, applied at first public release. Until then the repo stays private; the `LICENSE` file already declares Apache 2.0 to signal intent.

## Visibility timeline

| Phase | Visibility | Notes |
|---|---|---|
| Build (current) | Private | `.migration/` lives in-tree as a private bridge to reference material |
| Pre-release | Private | Sanity sweep — confirm no committed file references sibling-repo paths |
| Public release | Public | `.migration/` removed; repo flipped public; first tag cut |

## Public-flip checklist

Run before flipping the repo public:

- [ ] `.migration/` directory removed from the working tree
- [ ] `git grep` for sibling-repo path names returns no hits in tracked files
- [ ] `LICENSE` present, Apache 2.0
- [ ] `README.md` states what predit does, requirements, install, quickstart
- [ ] At least one fully working show + episode + pipeline ships in the repo as a runnable example
- [ ] `predit init --starter <name> && predit build <show>/sample-episode --sample` succeeds end-to-end on a fresh clone with **zero API keys configured** (uses Piper TTS + Pixabay/Pexels free + ffmpeg)
- [ ] `predit watch` and `predit import` work against a fixture drop folder
- [ ] Smoke test runs green on a fresh clone (`pnpm install && pnpm build && pnpm test`)
- [ ] CHANGELOG entry for v0.1.0
- [ ] All open issues tagged with the `pre-release` milestone are closed or moved to `post-release`
