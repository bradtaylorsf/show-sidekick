---
"show-sidekick": minor
---

Full builds can now run unattended. `showkick build --agent "<command>"` (or `SHOW_SIDEKICK_AGENT`) spawns a headless agent for each stage, and `--review-gate final` defers required approvals to a single review after the last stage. Each deferred approval is logged, and any critical reviewer finding still halts the run. A full build with no agent attached now fails fast with guidance instead of `stream ended before a matching stage event was emitted` (#298).
