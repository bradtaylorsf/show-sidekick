# predit specs

These specs capture the locked design decisions for `predit`. Implementation must follow what's here. Anything not in a spec is open to design at implementation time, with the result then captured back here.

## Read order

### Foundations

1. [`00-overview.md`](00-overview.md) — what predit is and the three-layer mental model
2. [`01-repo-and-licensing.md`](01-repo-and-licensing.md) — repo visibility, license, public-flip plan
3. [`02-build-stack.md`](02-build-stack.md) — runtime, package manager, build, test, CLI library

### Surface area

4. [`03-cli.md`](03-cli.md) — command surface
5. [`04-shows-and-episodes.md`](04-shows-and-episodes.md) — `show.yaml`, `episode.yaml`, resolution order
6. [`05-pipelines.md`](05-pipelines.md) — pipeline manifest, harness runtime, stages
7. [`06-tool-registry.md`](06-tool-registry.md) — `Tool` interface, integration kinds, registry surface
8. [`07-audio-subsystem.md`](07-audio-subsystem.md) — Cuesheet, primitives, master clock
9. [`08-skills.md`](08-skills.md) — skill formats and scoping
10. [`09-export.md`](09-export.md) — NLE handoff (Premiere / CapCut / DaVinci / EDL)

### Installation and orchestration

11. [`10-installation-and-user-projects.md`](10-installation-and-user-projects.md) — harness vs user-project split, cache layout, resolution
12. [`11-agent-driven-production.md`](11-agent-driven-production.md) — philosophy and how the agent does production
13. [`12-checkpoint-protocol.md`](12-checkpoint-protocol.md) — checkpoint lifecycle, resume, sample sub-checkpoints
14. [`13-reviewer-protocol.md`](13-reviewer-protocol.md) — self-review with CHAI rules
15. [`14-decision-log.md`](14-decision-log.md) — cumulative audit trail of material choices
16. [`15-announce-and-escalate.md`](15-announce-and-escalate.md) — decision communication contract
17. [`16-onboarding-and-discovery.md`](16-onboarding-and-discovery.md) — first-contact UX
18. [`17-self-review-of-output.md`](17-self-review-of-output.md) — final review of rendered output

## How to update a spec

Specs are living documents. When a decision changes:

1. Edit the relevant spec(s) in a single commit.
2. Reference the commit in the PR description that follows.
3. If the change invalidates code that already exists, that code is wrong as of this commit — open an issue.
