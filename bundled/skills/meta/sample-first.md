---
name: sample-first
description: Require a representative sample run before expensive, slow, reference-driven, or motion-sensitive productions.
---

# Sample-First Protocol

Use this meta skill at proposal time when a pipeline trigger says the user should review a sample before a full batch run.

## When To Trigger

| Pipeline | Trigger |
|---|---|
| music-video | cost `> $0.50` OR time `> 15 min` |
| news-song | cost `> $1.00` OR time `> 15 min` |
| cinematic | ALWAYS when reference-driven OR motion-required |
| character-animation | ALWAYS |
| documentary-montage | ALWAYS when 1+ hero scene present |
| animated-explainer, animation, hybrid | cost `> $1.00` OR time `> 20 min` |
| avatar-spokesperson, talking-head | cost `> $0.50` |

## Protocol

1. Set `production_plan.sample_required: true` in the proposal packet.
2. Use the pipeline manifest's `sample` block to scope the sample: `duration_s_min..duration_s_max` and `hint`.
3. Produce one sample sub-checkpoint that exercises the real creative and technical path.
4. Ask the user to review the sample before full batch execution.
5. Run the full batch only after approval or after a logged override.

## Override

If the user insists on skipping the sample, say this verbatim:

> I'd recommend a sample first because <reason>. If you want to skip it, I'll log a downgrade_approval decision and proceed at full cost.

If the user still wants to skip, record a `downgrade_approval` decision explaining the sample-first skip and continue.

## Cross-References

- `specs/16-onboarding-and-discovery.md`
- audit C-23
