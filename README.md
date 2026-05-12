# predit

AI pre-production for video. Builds the rough cut and an EDL/XML you finish in Premiere or CapCut.

**Status:** in active development. Public release on Apache 2.0 once the core pipelines reach feature parity.

## What it does

`predit` is a show-first video production harness. You author a *show* once — its pipeline, look, characters, brand — then add *episodes*, where each episode is one rendered output. The agent drives production stage by stage, snaps visuals to audio structure (beats, sections, climax), and hands off a rough cut you can ship as draft or finish in a real NLE.

## Quick links

- [`specs/`](specs/) — the design specs that drive implementation
- [`AGENTS.md`](AGENTS.md) — agent operating contract

## License

Apache 2.0 (planned, applied at first public release).
